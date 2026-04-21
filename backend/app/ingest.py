"""
Ingestion pipeline: PDF → text → candidates → translations → database.
Importable from both the CLI script and the API.
"""
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from app.extractor import extract_text_from_pdf
from app.nlp import extract_candidates
from app.translator import translate_batch
from app.models import Book, Chapter, Word, ChapterWord, WordProgress


@dataclass
class IngestResult:
    book_id: int
    book_title: str
    chapter_id: int
    chapter_title: str
    words_saved: int
    words_rejected: int
    words_incomplete: int


def _get_or_create_book(db: Session, title: str) -> Book:
    book = db.query(Book).filter_by(title=title).first()
    if not book:
        book = Book(title=title)
        db.add(book)
        db.flush()
    return book


def _get_or_create_chapter(db: Session, book: Book, title: str, source: str, pages: str) -> Chapter:
    chapter = db.query(Chapter).filter_by(book_id=book.id, title=title).first()
    if not chapter:
        chapter = Chapter(book=book, title=title, source_file=source, page_range=pages)
        db.add(chapter)
        db.flush()
    return chapter


def _save_word(db: Session, data: dict) -> Word | None:
    lemma = data.get("word")
    pos = data.get("pos")
    english = data.get("english")
    if not lemma or not pos or not english:
        return None
    if pos not in ("noun", "verb", "adjective", "adverb"):
        return None

    existing = db.query(Word).filter_by(lemma=lemma, pos=pos).first()
    if existing:
        return existing

    word = Word(
        lemma=lemma, pos=pos,
        article=data.get("article"),
        plural=data.get("plural"),
        english=english,
        example_de=data.get("example_de"),
        example_en=data.get("example_en"),
    )
    db.add(word)
    db.flush()
    db.add(WordProgress(word_id=word.id))
    return word


def _link_word_to_chapter(db: Session, chapter: Chapter, word: Word, frequency: int):
    existing = db.query(ChapterWord).filter_by(
        chapter_id=chapter.id, word_id=word.id
    ).first()
    if existing:
        existing.frequency += frequency
    else:
        db.add(ChapterWord(chapter_id=chapter.id, word_id=word.id, frequency=frequency))
    db.flush()


def ingest_pdf(
    db: Session,
    pdf_path: Path,
    book_title: str,
    chapter_title: str,
    max_pages: int = 10,
) -> IngestResult:
    text = extract_text_from_pdf(pdf_path, max_pages)
    candidates = extract_candidates(text)
    print(f"Found {len(candidates)} unique candidate words")

    lemmas = [c["lemma"] for c in candidates.values()]
    translations = translate_batch(lemmas)

    book = _get_or_create_book(db, book_title)
    chapter = _get_or_create_chapter(
        db, book, chapter_title, source=str(pdf_path), pages=f"1-{max_pages}"
    )

    saved = 0
    rejected = 0
    incomplete = 0
    for candidate, translation in zip(candidates.values(), translations):
        if translation is None:
            rejected += 1
            continue
        word = _save_word(db, translation)
        if word is None:
            incomplete += 1
            continue
        _link_word_to_chapter(db, chapter, word, candidate["frequency"])
        saved += 1

    db.commit()

    return IngestResult(
        book_id=book.id, book_title=book.title,
        chapter_id=chapter.id, chapter_title=chapter.title,
        words_saved=saved, words_rejected=rejected, words_incomplete=incomplete,
    )