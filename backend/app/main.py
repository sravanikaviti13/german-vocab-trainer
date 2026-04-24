"""FastAPI application."""
import os
from pathlib import Path
import shutil
import tempfile

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db import SessionLocal, init_db
from app.models import Book, Chapter, Word, ChapterWord, WordProgress, ArticleAttempt, Sentence
from app.schemas import (
    BookOut, ChapterOut, WordOut, WordWithProgress,
    IngestResponse, ReviewIn, ArticleAttemptIn, SentenceCheckIn, SentenceCheckOut,
)
from app.ingest import ingest_pdf
from app.srs import schedule_next_review

from collections import defaultdict
from typing import Literal

from app.sentence_validator import validate_sentence


app = FastAPI(title="German Vocab Trainer")

# Allow browser requests from the React dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_origin_regex=r"https://.*\.trycloudflare\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    books = db.query(Book).all()
    result = []
    for book in books:
        chapters_out = []
        for ch in book.chapters:
            word_count = db.query(func.count(ChapterWord.id)).filter_by(chapter_id=ch.id).scalar()
            chapters_out.append(ChapterOut(
                id=ch.id, title=ch.title, page_range=ch.page_range,
                created_at=ch.created_at, word_count=word_count,
            ))
        result.append(BookOut(
            id=book.id, title=book.title, language=book.language,
            chapters=chapters_out,
        ))
    return result


@app.get("/api/chapters/{chapter_id}/words", response_model=list[WordWithProgress])
def get_chapter_words(
    chapter_id: int,
    pos: str | None = None,
    db: Session = Depends(get_db),
):
    chapter = db.query(Chapter).filter_by(id=chapter_id).first()
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
    chapter = db.query(Chapter).filter_by(id=chapter_id).first()
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
    if scope == "chapter":
        if id is None:
            raise HTTPException(400, "id required for chapter scope")
        base_chapter = db.query(Chapter).filter_by(id=id).first()
        if not base_chapter:
            raise HTTPException(404, "Chapter not found")

        # Seed: word IDs from this chapter
        seed_word_ids = {cw.word_id for cw in base_chapter.chapter_words}

        # Expand: for each seed word, include all chapters where it also appears
        related_chapter_ids = set()
        for wid in seed_word_ids:
            for cw in db.query(ChapterWord).filter_by(word_id=wid).all():
                related_chapter_ids.add(cw.chapter_id)

        chapters = db.query(Chapter).filter(Chapter.id.in_(related_chapter_ids)).all()
        # Only include words from the seed chapter OR words sharing a chapter with them
        # but tag the seed words so the frontend can highlight them
        highlighted_word_ids = seed_word_ids

    elif scope == "book":
        if id is None:
            raise HTTPException(400, "id required for book scope")
        chapters = db.query(Chapter).filter_by(book_id=id).all()
        highlighted_word_ids = set()
    else:
        chapters = db.query(Chapter).all()
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
        stored_id=row.id,
    )


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