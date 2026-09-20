"""FastAPI application."""
import hashlib
import hmac
import os
from pathlib import Path
import shutil
import tempfile

from fastapi import FastAPI, Depends, HTTPException, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func

from app.db import SessionLocal, init_db
from app.models import Book, Chapter, Word, ChapterWord, WordProgress, ArticleAttempt, Sentence
from app.schemas import (
    BookOut, ChapterOut, WordOut, WordWithProgress,
    IngestResponse, ReviewIn, ArticleAttemptIn, SentenceCheckIn, SentenceCheckOut,
    SentencePromptsOut, GrammarTopicIn, WordManualIn, WordBulkIn, WordBulkOut,
)
from app.srs import schedule_next_review

from collections import defaultdict
from typing import Literal

from app.sentence_validator import validate_sentence, generate_sentence_prompts

CEFR_LEVELS = {"A1", "A2", "B1", "B2", "C1", "C2"}


app = FastAPI(title="German Vocab Trainer")

# Optional gate: if APP_PASSWORD is set, every request (except health check
# and login) must carry a matching bearer token. Unset (e.g. local dev by
# default) means no gate at all.
APP_PASSWORD = os.getenv("APP_PASSWORD")
AUTH_TOKEN = hashlib.sha256(APP_PASSWORD.encode()).hexdigest() if APP_PASSWORD else None
PUBLIC_PATHS = {"/api/health", "/api/auth/login", "/api/auth/status"}


@app.middleware("http")
async def auth_gate(request: Request, call_next):
    if AUTH_TOKEN and request.method != "OPTIONS" and request.url.path not in PUBLIC_PATHS:
        header = request.headers.get("authorization", "")
        if not hmac.compare_digest(header, f"Bearer {AUTH_TOKEN}"):
            return JSONResponse({"detail": "Unauthorized"}, status_code=401)
    return await call_next(request)


# Registered AFTER auth_gate so it wraps OUTSIDE it — CORS headers must be
# added even to the 401 responses auth_gate returns, or the browser reports
# a generic CORS failure instead of a readable 401.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "https://german-vocab-trainer-ten.vercel.app"],
    # trycloudflare/vercel previews, plus any localhost port and private LAN IP
    # (192.168.x.x/10.x.x.x, e.g. testing from a phone on the same Wi-Fi) for local dev
    allow_origin_regex=r"https://.*\.(trycloudflare\.com|vercel\.app)|http://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/auth/status")
def auth_status():
    return {"login_required": bool(APP_PASSWORD)}


@app.post("/api/auth/login")
def login(payload: dict):
    if not APP_PASSWORD:
        raise HTTPException(404, "Login is not enabled")
    password = str(payload.get("password", ""))
    if not hmac.compare_digest(password, APP_PASSWORD):
        raise HTTPException(401, "Wrong password")
    return {"token": AUTH_TOKEN}


@app.on_event("startup")
def on_startup():
    init_db()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/api/health")
def health():
    return {"status": "ok"}

@app.post("/api/upload", response_model=IngestResponse)
async def upload_pdf(
    file: UploadFile = File(...),
    book: str = Form(...),
    chapter: str = Form(...),
    pages: int = Form(10),
    db: Session = Depends(get_db),
):
    if os.getenv("DISABLE_UPLOAD") == "1":
        raise HTTPException(
            503,
            "Upload is disabled on the hosted server. Use the local ingest script to add chapters."
        )
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported.")

    # Imported lazily: pulls in spaCy/pdfplumber/OCR deps, which aren't
    # installed in prod (upload is disabled there via DISABLE_UPLOAD).
    from app.ingest import ingest_pdf

    # Save upload to a temp file so extractor can read from disk
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = Path(tmp.name)

    try:
        result = ingest_pdf(db, tmp_path, book, chapter, pages)
    finally:
        tmp_path.unlink(missing_ok=True)

    return IngestResponse(
        book_id=result.book_id,
        book_title=result.book_title,
        chapter_id=result.chapter_id,
        chapter_title=result.chapter_title,
        words_saved=result.words_saved,
        words_rejected=result.words_rejected,
    )


@app.get("/api/books", response_model=list[BookOut])
def list_books(db: Session = Depends(get_db)):
    # Grammar topics live under their own book but get their own page/endpoint
    books = db.query(Book).options(selectinload(Book.chapters)).filter_by(kind="vocab").all()

    word_counts = dict(
        db.query(ChapterWord.chapter_id, func.count(ChapterWord.id))
        .group_by(ChapterWord.chapter_id)
        .all()
    )

    result = []
    for book in books:
        chapters_out = []
        for ch in book.chapters:
            chapters_out.append(ChapterOut(
                id=ch.id, title=ch.title, page_range=ch.page_range,
                created_at=ch.created_at, word_count=word_counts.get(ch.id, 0),
            ))
        result.append(BookOut(
            id=book.id, title=book.title, language=book.language, kind=book.kind,
            chapters=chapters_out,
        ))
    return result


GRAMMAR_BOOK_TITLE = "Grammar Topics"


def _get_or_create_grammar_book(db: Session) -> Book:
    book = db.query(Book).filter_by(kind="grammar").first()
    if not book:
        book = Book(title=GRAMMAR_BOOK_TITLE, language="de", kind="grammar")
        db.add(book)
        db.commit()
        db.refresh(book)
    return book


@app.get("/api/grammar/topics", response_model=list[ChapterOut])
def list_grammar_topics(db: Session = Depends(get_db)):
    book = db.query(Book).options(selectinload(Book.chapters)).filter_by(kind="grammar").first()
    if not book:
        return []

    word_counts = dict(
        db.query(ChapterWord.chapter_id, func.count(ChapterWord.id))
        .group_by(ChapterWord.chapter_id)
        .all()
    )
    return [
        ChapterOut(
            id=ch.id, title=ch.title, page_range=ch.page_range,
            created_at=ch.created_at, word_count=word_counts.get(ch.id, 0),
        )
        for ch in book.chapters
    ]


@app.post("/api/grammar/topics", response_model=ChapterOut)
def create_grammar_topic(payload: GrammarTopicIn, db: Session = Depends(get_db)):
    title = payload.title.strip()
    if not title:
        raise HTTPException(400, "Title is required")

    book = _get_or_create_grammar_book(db)
    existing = (
        db.query(Chapter)
        .filter(Chapter.book_id == book.id, func.lower(Chapter.title) == title.lower())
        .first()
    )
    if existing:
        raise HTTPException(409, "A topic with this title already exists")

    chapter = Chapter(book_id=book.id, title=title)
    db.add(chapter)
    db.commit()
    db.refresh(chapter)
    return ChapterOut(
        id=chapter.id, title=chapter.title, page_range=chapter.page_range,
        created_at=chapter.created_at, word_count=0,
    )


class DuplicateWordError(Exception):
    pass


def _add_word_to_chapter(db: Session, chapter_id: int, word_in: WordManualIn) -> Word:
    """Add lemma/pos to the chapter. Raises DuplicateWordError if it's already there."""
    lemma = word_in.lemma.strip()
    if word_in.pos == "noun":
        lemma = lemma[:1].upper() + lemma[1:]

    word = db.query(Word).filter_by(lemma=lemma, pos=word_in.pos).first()
    if word:
        existing_link = db.query(ChapterWord).filter_by(chapter_id=chapter_id, word_id=word.id).first()
        if existing_link:
            raise DuplicateWordError(f'"{lemma}" is already in this topic')
    else:
        example_de, example_en = word_in.example_de, word_in.example_en
        if not example_de and not example_en:
            from app.translator import generate_example
            generated = generate_example(lemma, word_in.pos, word_in.english.strip(), word_in.article)
            example_de, example_en = generated["example_de"], generated["example_en"]

        word = Word(
            lemma=lemma, pos=word_in.pos, article=word_in.article,
            plural=word_in.plural, english=word_in.english.strip(),
            example_de=example_de, example_en=example_en,
        )
        db.add(word)
        db.flush()  # get word.id before creating dependent rows
        db.add(WordProgress(word_id=word.id))

    db.add(ChapterWord(chapter_id=chapter_id, word_id=word.id, frequency=1))
    return word


@app.post("/api/chapters/{chapter_id}/words", response_model=WordOut)
def add_word_to_chapter(chapter_id: int, payload: WordManualIn, db: Session = Depends(get_db)):
    chapter = db.query(Chapter).filter_by(id=chapter_id).first()
    if not chapter:
        raise HTTPException(404, "Chapter not found")
    if not payload.lemma.strip() or not payload.english.strip():
        raise HTTPException(400, "lemma and english are required")

    try:
        word = _add_word_to_chapter(db, chapter_id, payload)
    except DuplicateWordError as e:
        raise HTTPException(409, str(e))
    db.commit()
    db.refresh(word)
    return word


@app.post("/api/chapters/{chapter_id}/words/bulk", response_model=WordBulkOut)
def add_words_to_chapter_bulk(chapter_id: int, payload: WordBulkIn, db: Session = Depends(get_db)):
    chapter = db.query(Chapter).filter_by(id=chapter_id).first()
    if not chapter:
        raise HTTPException(404, "Chapter not found")

    saved_words = []
    duplicates = 0
    seen_in_batch = set()
    for item in payload.items:
        if not item.lemma.strip() or not item.english.strip():
            continue
        key = (item.lemma.strip().lower(), item.pos)
        if key in seen_in_batch:
            duplicates += 1
            continue  # repeated within the pasted text itself
        seen_in_batch.add(key)
        try:
            saved_words.append(_add_word_to_chapter(db, chapter_id, item))
        except DuplicateWordError:
            duplicates += 1

    db.commit()
    for w in saved_words:
        db.refresh(w)
    return WordBulkOut(saved=len(saved_words), duplicates=duplicates, words=saved_words)


@app.delete("/api/chapters/{chapter_id}/words/{word_id}")
def remove_word_from_chapter(chapter_id: int, word_id: int, db: Session = Depends(get_db)):
    link = db.query(ChapterWord).filter_by(chapter_id=chapter_id, word_id=word_id).first()
    if not link:
        raise HTTPException(404, "Word not found in this chapter")
    db.delete(link)
    db.flush()

    # If the word isn't used anywhere else, clean it up fully instead of
    # leaving an orphaned row (and so re-adding the same lemma isn't blocked).
    other_links = db.query(ChapterWord).filter_by(word_id=word_id).first()
    has_sentences = db.query(Sentence).filter_by(word_id=word_id).first()
    has_attempts = db.query(ArticleAttempt).filter_by(word_id=word_id).first()
    if not other_links and not has_sentences and not has_attempts:
        db.query(WordProgress).filter_by(word_id=word_id).delete()
        db.query(Word).filter_by(id=word_id).delete()

    db.commit()
    return {"ok": True}


@app.get("/api/chapters/{chapter_id}/words", response_model=list[WordWithProgress])
def get_chapter_words(
    chapter_id: int,
    pos: str | None = None,
    db: Session = Depends(get_db),
):
    chapter = (
        db.query(Chapter)
        .options(
            selectinload(Chapter.chapter_words)
            .selectinload(ChapterWord.word)
            .selectinload(Word.progress)
        )
        .filter_by(id=chapter_id)
        .first()
    )
    if not chapter:
        raise HTTPException(404, "Chapter not found")

    out = []
    for cw in chapter.chapter_words:
        word = cw.word
        if pos and word.pos != pos:
            continue  # filter by POS if requested
        progress = word.progress
        out.append(WordWithProgress(
            id=word.id, lemma=word.lemma, pos=word.pos,
            article=word.article, plural=word.plural, english=word.english,
            example_de=word.example_de, example_en=word.example_en,
            times_seen=progress.times_seen if progress else 0,
            times_correct=progress.times_correct if progress else 0,
            strength=progress.strength if progress else 0,
            next_review=progress.next_review if progress else None,
        ))
    return out

@app.get("/api/chapters/{chapter_id}")
def get_chapter_summary(chapter_id: int, db: Session = Depends(get_db)):
    """Return chapter metadata + word counts, plus most-recent-session article mastery."""
    chapter = (
        db.query(Chapter)
        .options(
            selectinload(Chapter.book),
            selectinload(Chapter.chapter_words)
            .selectinload(ChapterWord.word)
            .selectinload(Word.progress),
        )
        .filter_by(id=chapter_id)
        .first()
    )
    if not chapter:
        raise HTTPException(404, "Chapter not found")

    counts = {"noun": 0, "verb": 0, "adjective": 0, "adverb": 0}
    from datetime import date
    today = date.today()
    due = 0

    for cw in chapter.chapter_words:
        word = cw.word
        if word.pos in counts:
            counts[word.pos] += 1
            if word.progress and word.progress.next_review and word.progress.next_review <= today:
                due += 1

    # Article mastery = accuracy of the most recent article drill session.
    # A "session" is a contiguous run of attempts with no gap >30min.
    from datetime import timedelta
    SESSION_GAP = timedelta(minutes=30)

    attempts = (
        db.query(ArticleAttempt)
        .filter(ArticleAttempt.chapter_id == chapter_id)
        .order_by(ArticleAttempt.created_at.desc())
        .all()
    )

    article_mastery = None
    last_session_size = 0

    if attempts:
        # Walk backward from the newest attempt, stop when gap > SESSION_GAP
        session = [attempts[0]]
        for i in range(1, len(attempts)):
            gap = session[-1].created_at - attempts[i].created_at
            if gap > SESSION_GAP:
                break
            session.append(attempts[i])
        correct = sum(a.correct for a in session)
        article_mastery = round(100 * correct / len(session))
        last_session_size = len(session)

    mastery = {
        "noun": article_mastery,  # from the most recent drill session only
        "verb": None,
        "adjective": None,
        "adverb": None,
    }

    return {
        "id": chapter.id,
        "title": chapter.title,
        "book_title": chapter.book.title,
        "book_kind": chapter.book.kind,
        "page_range": chapter.page_range,
        "counts": counts,
        "mastery": mastery,
        "last_session_size": last_session_size,  # for tooltip
        "total": sum(counts.values()),
        "due_today": due,
    }

@app.get("/api/words/review", response_model=list[WordWithProgress])
def get_words_for_review(limit: int = 20, db: Session = Depends(get_db)):
    from datetime import date
    today = date.today()
    progress_due = (
        db.query(WordProgress)
        .options(selectinload(WordProgress.word))
        .filter(WordProgress.next_review <= today)
        .limit(limit)
        .all()
    )
    out = []
    for p in progress_due:
        w = p.word
        out.append(WordWithProgress(
            id=w.id, lemma=w.lemma, pos=w.pos,
            article=w.article, plural=w.plural, english=w.english,
            example_de=w.example_de, example_en=w.example_en,
            times_seen=p.times_seen, times_correct=p.times_correct,
            strength=p.strength, next_review=p.next_review,
        ))
    return out


@app.post("/api/words/{word_id}/review")
def record_review(word_id: int, review: ReviewIn, db: Session = Depends(get_db)):
    progress = db.query(WordProgress).filter_by(word_id=word_id).first()
    if not progress:
        raise HTTPException(404, "Word progress not found")

    schedule_next_review(progress, review.correct, review.override_days)
    db.commit()
    return {
        "word_id": word_id,
        "next_review": progress.next_review,
        "strength": progress.strength,
        "times_seen": progress.times_seen,
        "interval_days": progress.interval_days,
    }

@app.post("/api/article-attempts")
def log_article_attempt(
    attempt: ArticleAttemptIn,
    db: Session = Depends(get_db),
):
    """Log a single article drill attempt for session-based mastery tracking."""
    row = ArticleAttempt(
        word_id=attempt.word_id,
        chapter_id=attempt.chapter_id,
        correct=1 if attempt.correct else 0,
    )
    db.add(row)
    db.commit()
    return {"ok": True}

@app.get("/api/graph")
def get_graph(
    scope: Literal["all", "book", "chapter"] = "book",
    id: int | None = None,
    db: Session = Depends(get_db),
):
    """
    Returns nodes (words) and edges (co-occurrences) for the vocab network graph.

    scope:
      - "all": every word you have
      - "book": words in one book (requires id = book_id). Edges = share a chapter in the book.
      - "chapter": words in one chapter PLUS words they co-occur with in other chapters.
                   Edges = share any chapter anywhere. Requires id = chapter_id.
    """
    chapter_eager = selectinload(Chapter.chapter_words).selectinload(ChapterWord.word).selectinload(Word.progress)

    if scope == "chapter":
        if id is None:
            raise HTTPException(400, "id required for chapter scope")
        base_chapter = (
            db.query(Chapter)
            .options(selectinload(Chapter.chapter_words))
            .filter_by(id=id)
            .first()
        )
        if not base_chapter:
            raise HTTPException(404, "Chapter not found")

        # Seed: word IDs from this chapter
        seed_word_ids = {cw.word_id for cw in base_chapter.chapter_words}

        # Expand: all chapters where any seed word also appears
        related_chapter_ids = {
            cw.chapter_id
            for cw in db.query(ChapterWord).filter(ChapterWord.word_id.in_(seed_word_ids)).all()
        }

        chapters = (
            db.query(Chapter)
            .options(chapter_eager)
            .filter(Chapter.id.in_(related_chapter_ids))
            .all()
        )
        # Only include words from the seed chapter OR words sharing a chapter with them
        # but tag the seed words so the frontend can highlight them
        highlighted_word_ids = seed_word_ids

    elif scope == "book":
        if id is None:
            raise HTTPException(400, "id required for book scope")
        chapters = db.query(Chapter).options(chapter_eager).filter_by(book_id=id).all()
        highlighted_word_ids = set()
    else:
        chapters = db.query(Chapter).options(chapter_eager).all()
        highlighted_word_ids = set()

    if not chapters:
        return {"nodes": [], "edges": []}

    # Collect words appearing in these chapters
    word_chapters: dict[int, set[int]] = defaultdict(set)
    words_by_id: dict[int, Word] = {}
    for ch in chapters:
        for cw in ch.chapter_words:
            word_chapters[cw.word_id].add(ch.id)
            words_by_id[cw.word_id] = cw.word

    # Build nodes
    nodes = []
    for word_id, word in words_by_id.items():
        progress = word.progress
        times_seen = progress.times_seen if progress else 0
        times_correct = progress.times_correct if progress else 0
        strength = progress.strength if progress else 0
        accuracy = (times_correct / times_seen) if times_seen > 0 else None

        nodes.append({
            "id": word_id,
            "lemma": word.lemma,
            "pos": word.pos,
            "article": word.article,
            "english": word.english,
            "times_seen": times_seen,
            "strength": strength,
            "accuracy": accuracy,
            "chapter_count": len(word_chapters[word_id]),
            "highlighted": word_id in highlighted_word_ids,
        })

    # Edges: co-occurrence within chapters in scope
    edge_weights: dict[tuple[int, int], int] = defaultdict(int)
    for ch in chapters:
        word_ids = sorted(cw.word_id for cw in ch.chapter_words)
        for i in range(len(word_ids)):
            for j in range(i + 1, len(word_ids)):
                edge_weights[(word_ids[i], word_ids[j])] += 1

    edges = [
        {"source": a, "target": b, "weight": w}
        for (a, b), w in edge_weights.items()
    ]

    return {"nodes": nodes, "edges": edges}


@app.post("/api/sentences/check", response_model=SentenceCheckOut)
def check_sentence(
    payload: SentenceCheckIn,
    db: Session = Depends(get_db),
):
    """Validate a user's sentence with Groq, store the result, update progress."""
    word = db.query(Word).filter_by(id=payload.word_id).first()
    if not word:
        raise HTTPException(404, "Word not found")

    sentence_text = payload.sentence.strip()
    if len(sentence_text) < 3:
        raise HTTPException(400, "Sentence too short")

    result = validate_sentence(
        word=word.lemma,
        pos=word.pos,
        english=word.english,
        sentence=sentence_text,
        article=word.article,
    )

    # Store the sentence
    row = Sentence(
        word_id=word.id,
        user_text=sentence_text,
        correct=1 if result["correct"] else 0,
        corrected_text=result["corrected"],
        feedback=result["feedback"],
    )
    db.add(row)

    # Update progress: count as a review + bump sentences_written if correct
    progress = word.progress
    if progress:
        progress.times_seen += 1
        if result["correct"]:
            progress.times_correct += 1
            progress.sentences_written += 1
            progress.strength = min(5, progress.strength + 1)

    db.commit()
    db.refresh(row)

    return SentenceCheckOut(
        correct=result["correct"],
        corrected=result["corrected"],
        feedback=result["feedback"],
        meaning_en=result["meaning_en"],
        stored_id=row.id,
    )


@app.get("/api/words/{word_id}/prompts", response_model=SentencePromptsOut)
def get_sentence_prompts(word_id: int, level: str = "A2", db: Session = Depends(get_db)):
    """Generate a few English sentences (using this word) for the learner to translate."""
    word = db.query(Word).filter_by(id=word_id).first()
    if not word:
        raise HTTPException(404, "Word not found")

    level = level.upper()
    if level not in CEFR_LEVELS:
        raise HTTPException(400, f"level must be one of {sorted(CEFR_LEVELS)}")

    prompts = generate_sentence_prompts(
        word=word.lemma, pos=word.pos, english=word.english, level=level,
    )
    return SentencePromptsOut(level=level, prompts=prompts)


@app.get("/api/words/{word_id}/sentences")
def list_sentences(word_id: int, db: Session = Depends(get_db)):
    """List past sentences written for a word."""
    rows = (
        db.query(Sentence)
        .filter_by(word_id=word_id)
        .order_by(Sentence.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "id": r.id,
            "user_text": r.user_text,
            "correct": bool(r.correct),
            "corrected_text": r.corrected_text,
            "feedback": r.feedback,
            "created_at": r.created_at,
        }
        for r in rows
    ]