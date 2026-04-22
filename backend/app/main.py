"""FastAPI application."""
from pathlib import Path
import shutil
import tempfile

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db import SessionLocal, init_db
from app.models import Book, Chapter, Word, ChapterWord, WordProgress
from app.schemas import (
    BookOut, ChapterOut, WordOut, WordWithProgress,
    IngestResponse, ReviewIn,
)
from app.ingest import ingest_pdf
from app.srs import schedule_next_review

app = FastAPI(title="German Vocab Trainer")

# Allow browser requests from the React dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
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
    """Return chapter metadata + word counts per POS."""
    chapter = db.query(Chapter).filter_by(id=chapter_id).first()
    if not chapter:
        raise HTTPException(404, "Chapter not found")

    # Count words by POS
    counts = {"noun": 0, "verb": 0, "adjective": 0, "adverb": 0}
    for cw in chapter.chapter_words:
        pos = cw.word.pos
        if pos in counts:
            counts[pos] += 1

    # Count words due for review in this chapter
    from datetime import date
    today = date.today()
    due = 0
    for cw in chapter.chapter_words:
        if cw.word.progress and cw.word.progress.next_review and cw.word.progress.next_review <= today:
            due += 1

    return {
        "id": chapter.id,
        "title": chapter.title,
        "book_title": chapter.book.title,
        "page_range": chapter.page_range,
        "counts": counts,
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