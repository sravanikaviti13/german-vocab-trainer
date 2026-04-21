"""
SQLite database connection and session management.
"""
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DB_PATH = Path(__file__).parent.parent / "vocab.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    DATABASE_URL,
    echo=False,  # set True to see every SQL query in console
    connect_args={"check_same_thread": False},  # needed for SQLite + FastAPI later
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def get_session():
    """Context manager for a DB session that auto-closes."""
    session = SessionLocal()
    try:
        return session
    except Exception:
        session.close()
        raise


def init_db():
    """Create all tables. Safe to run multiple times."""
    # Import models so they register with Base
    from app import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    print(f"Database initialized at {DB_PATH}")