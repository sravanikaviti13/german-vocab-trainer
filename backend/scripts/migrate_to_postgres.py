"""
One-time migration: copy all data from local vocab.db to the configured DATABASE_URL.
Assumes DATABASE_URL is a Postgres URL and you have a vocab.db file.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import engine as target_engine, Base
from app.models import (
    Book, Chapter, Word, ChapterWord, WordProgress,
    ArticleAttempt, Sentence,
)

# Source: the old SQLite file
source_url = f"sqlite:///{Path(__file__).parent.parent / 'vocab.db'}"
source_engine = create_engine(source_url, connect_args={"check_same_thread": False})
SourceSession = sessionmaker(bind=source_engine)

# Make sure target schema exists
Base.metadata.create_all(target_engine)
TargetSession = sessionmaker(bind=target_engine)

src = SourceSession()
dst = TargetSession()

try:
    for Model in [Book, Chapter, Word, WordProgress, ChapterWord, ArticleAttempt, Sentence]:
        rows = src.query(Model).all()
        print(f"Copying {len(rows)} rows from {Model.__tablename__}...")
        for row in rows:
            # Detach from source session so we can add to target
            src.expunge(row)
            dst.merge(row)
    dst.commit()
    print("Migration complete.")
finally:
    src.close()
    dst.close()