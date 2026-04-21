import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.db import SessionLocal
from app.models import Book, Chapter, Word

db = SessionLocal()
for book in db.query(Book).all():
    print(f"\n📘 {book.title}")
    for chapter in book.chapters:
        print(f"  📄 {chapter.title} ({len(chapter.chapter_words)} words)")

print(f"\nTotal unique words: {db.query(Word).count()}")
db.close()