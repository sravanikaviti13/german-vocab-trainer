"""CLI wrapper for the ingestion pipeline."""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.db import SessionLocal, init_db
from app.ingest import ingest_pdf


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf_path", type=Path)
    parser.add_argument("--book", required=True)
    parser.add_argument("--chapter", required=True)
    parser.add_argument("--pages", type=int, default=10)
    args = parser.parse_args()

    if not args.pdf_path.exists():
        print(f"File not found: {args.pdf_path}")
        sys.exit(1)

    init_db()
    db = SessionLocal()
    try:
        result = ingest_pdf(db, args.pdf_path, args.book, args.chapter, args.pages)
        print(f"\nSaved {result.words_saved} words, "
              f"rejected {result.words_rejected}, "
              f"incomplete {result.words_incomplete}")
        print(f"Book: '{result.book_title}' / Chapter: '{result.chapter_title}'")
    finally:
        db.close()


if __name__ == "__main__":
    main()