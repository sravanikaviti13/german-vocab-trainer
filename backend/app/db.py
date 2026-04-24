"""Database connection — supports both SQLite (dev) and Postgres (prod)."""
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv(Path(__file__).parent.parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    # Default to local SQLite for backwards compatibility
    DB_PATH = Path(__file__).parent.parent / "vocab.db"
    DATABASE_URL = f"sqlite:///{DB_PATH}"

# SQLite needs a special connect_args; Postgres doesn't
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, echo=False, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def get_session():
    session = SessionLocal()
    try:
        return session
    except Exception:
        session.close()
        raise


def init_db():
    from app import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    # Show a truncated form to avoid leaking credentials in logs
    display = DATABASE_URL if len(DATABASE_URL) < 60 else DATABASE_URL[:40] + "..."
    print(f"Database initialized at {display}")