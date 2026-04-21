"""
Ingest a PDF: extract text, find vocabulary, translate, and save to the database.

Usage:
    python scripts/ingest_pdf.py <pdf_path> --book "Book Title" --chapter "Chapter Name" [--pages N]
"""
import argparse
import sys
from pathlib import Path

# Make app/ importable when running from scripts/
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.orm import Session

from app.db import SessionLocal, init_db
from app.extractor import extract_text_from_pdf
from app.nlp import extract_candidates
from app.translator import translate_batch
from app.models import Book, Chapter, Word, ChapterWord, WordProgress


def get_or_create_book(db: Session, title: str) -> Book:
    book = db.query(Book).filter_by(title=title).first()
    if not book:
        book = Book(title=title)
        db.add(book)
        db.flush()
    return book


def get_or_create_chapter(db: Session, book: Book, title: str, source: str, pages: str) -> Chapter:
    chapter = db.query(Chapter).filter_by(book_id=book.id, title=title).first()
    if not chapter:
        chapter = Chapter(book=book, title=title, source_file=source, page_range=pages)
        db.add(chapter)
        db.flush()
    return chapter


def save_word(db: Session, data: dict) -> Word | None:
    """
    Find or create a Word entry. Returns the persisted Word,
    or None if the data is incomplete/invalid.
    """
    lemma = data.get("word")
    pos = data.get("pos")
    english = data.get("english")

    # Required fields — if any are missing, skip this entry
    if not lemma or not pos or not english:
        return None

    # Validate pos value
    if pos not in ("noun", "verb", "adjective", "adverb"):
        return None

    existing = db.query(Word).filter_by(lemma=lemma, pos=pos).first()
    if existing:
        return existing

    word = Word(
        lemma=lemma,
        pos=pos,
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


def link_word_to_chapter(db: Session, chapter: Chapter, word: Word, frequency: int):
    existing = db.query(ChapterWord).filter_by(
        chapter_id=chapter.id, word_id=word.id
    ).first()
    if existing:
        existing.frequency += frequency  # aggregate — was "= frequency" before
    else:
        db.add(ChapterWord(chapter_id=chapter.id, word_id=word.id, frequency=frequency))
    db.flush()  # force the insert/update now so next iteration sees it


def ingest(pdf_path: Path, book_title: str, chapter_title: str, max_pages: int):
    init_db()

    text = extract_text_from_pdf(pdf_path, max_pages)
    candidates = extract_candidates(text)
    print(f"\nFound {len(candidates)} unique candidate words")

    # Build the list to send to the translator
    lemmas = [c["lemma"] for c in candidates.values()]
    print(f"Translating...")
    translations = translate_batch(lemmas)

    db = SessionLocal()
    try:
        book = get_or_create_book(db, book_title)
        chapter = get_or_create_chapter(
            db, book, chapter_title,
            source=str(pdf_path), pages=f"1-{max_pages}",
        )

        saved = 0
        rejected = 0
        incomplete = 0
        for candidate, translation in zip(candidates.values(), translations):
            if translation is None:
                rejected += 1
                continue
            word = save_word(db, translation)
            if word is None:
                incomplete += 1
                continue
            link_word_to_chapter(db, chapter, word, candidate["frequency"])
            saved += 1

        db.commit()
        print(f"\nSaved {saved} words, rejected {rejected}, incomplete {incomplete}")
        print(f"Book: '{book.title}' / Chapter: '{chapter.title}'")

        # Summary
        total_words = db.query(Word).count()
        total_chapters = db.query(Chapter).count()
        print(f"\nDatabase now contains {total_words} words across {total_chapters} chapters.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf_path", type=Path)
    parser.add_argument("--book", required=True, help="Book title")
    parser.add_argument("--chapter", required=True, help="Chapter title")
    parser.add_argument("--pages", type=int, default=10, help="Max pages to process")
    args = parser.parse_args()

    if not args.pdf_path.exists():
        print(f"File not found: {args.pdf_path}")
        sys.exit(1)

    ingest(args.pdf_path, args.book, args.chapter, args.pages)


if __name__ == "__main__":
    main()