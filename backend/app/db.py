"""Database connection — supports both SQLite (dev) and Postgres (prod)."""
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv(Path(__file__).parent.parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    # Default to local SQLite for backwards compatibility
    DB_PATH = Path(__file__).parent.parent / "vocab.db"
    DATABASE_URL = f"sqlite:///{DB_PATH}"

# SQLite needs a special connect_args; Postgres doesn't
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

# pool_pre_ping: after Render/Supabase wake from idle, pooled connections can
# be stale/dropped — this pings and transparently reconnects instead of erroring.
engine = create_engine(
    DATABASE_URL, echo=False, connect_args=connect_args, pool_pre_ping=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def get_session():
    session = SessionLocal()
    try:
        return session
    except Exception:
        session.close()
        raise


def _run_migrations():
    """Small additive migrations create_all() won't apply to existing tables."""
    inspector = inspect(engine)
    if "books" not in inspector.get_table_names():
        return  # fresh DB, create_all already made it with the current schema
    columns = {c["name"] for c in inspector.get_columns("books")}
    if "kind" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE books ADD COLUMN kind VARCHAR(20) DEFAULT 'vocab' NOT NULL"))
        print("Migrated: added books.kind")


def init_db():
    from app import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _run_migrations()
    # Show a truncated form to avoid leaking credentials in logs
    display = DATABASE_URL if len(DATABASE_URL) < 60 else DATABASE_URL[:40] + "..."
    print(f"Database initialized at {display}")