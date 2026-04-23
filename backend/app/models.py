"""
SQLAlchemy ORM models. Each class is a table.
"""
from datetime import datetime, date

from sqlalchemy import (
    Column, Integer, String, Text, Date, DateTime,
    ForeignKey, UniqueConstraint, Index
)
from sqlalchemy.orm import relationship

from app.db import Base


class Book(Base):
    __tablename__ = "books"
    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False, unique=True)
    language = Column(String(10), default="de")
    created_at = Column(DateTime, default=datetime.utcnow)

    chapters = relationship("Chapter", back_populates="book", cascade="all, delete-orphan")


class Chapter(Base):
    __tablename__ = "chapters"
    id = Column(Integer, primary_key=True)
    book_id = Column(Integer, ForeignKey("books.id"), nullable=False)
    title = Column(String(200), nullable=False)
    source_file = Column(String(500))           # path to original PDF
    page_range = Column(String(50))              # e.g. "1-3"
    created_at = Column(DateTime, default=datetime.utcnow)

    book = relationship("Book", back_populates="chapters")
    chapter_words = relationship("ChapterWord", back_populates="chapter", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("book_id", "title", name="uq_chapter_per_book"),
    )


class Word(Base):
    __tablename__ = "words"
    id = Column(Integer, primary_key=True)
    lemma = Column(String(100), nullable=False)   # e.g. "Berghütte"
    pos = Column(String(20), nullable=False)       # "noun" | "verb" | "adjective" | "adverb"
    article = Column(String(5))                    # "der" | "die" | "das" | null
    plural = Column(String(100))                   # for nouns
    english = Column(Text, nullable=False)
    example_de = Column(Text)
    example_en = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    chapter_words = relationship("ChapterWord", back_populates="word", cascade="all, delete-orphan")
    progress = relationship("WordProgress", back_populates="word", uselist=False, cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("lemma", "pos", name="uq_word_lemma_pos"),
        Index("idx_word_lemma", "lemma"),
    )


class ChapterWord(Base):
    """Link table: which words appear in which chapters."""
    __tablename__ = "chapter_words"
    id = Column(Integer, primary_key=True)
    chapter_id = Column(Integer, ForeignKey("chapters.id"), nullable=False)
    word_id = Column(Integer, ForeignKey("words.id"), nullable=False)
    frequency = Column(Integer, default=1)  # how many times it appeared

    chapter = relationship("Chapter", back_populates="chapter_words")
    word = relationship("Word", back_populates="chapter_words")

    __table_args__ = (
        UniqueConstraint("chapter_id", "word_id", name="uq_word_per_chapter"),
    )


class WordProgress(Base):
    """Per-word learning stats for spaced repetition."""
    __tablename__ = "word_progress"
    id = Column(Integer, primary_key=True)
    word_id = Column(Integer, ForeignKey("words.id"), unique=True, nullable=False)

    times_seen = Column(Integer, default=0)
    times_correct = Column(Integer, default=0)
    sentences_written = Column(Integer, default=0)  # for the graph bubble size
    strength = Column(Integer, default=0)            # 0–5 mastery level

    # Spaced repetition
    ease_factor = Column(Integer, default=250)      # SM-2 ease (store as int, /100)
    interval_days = Column(Integer, default=0)
    next_review = Column(Date, default=date.today)
    last_reviewed = Column(DateTime)

    word = relationship("Word", back_populates="progress")

class ArticleAttempt(Base):
    """Log of individual article drill attempts. Powers session-based mastery."""
    __tablename__ = "article_attempts"
    id = Column(Integer, primary_key=True)
    word_id = Column(Integer, ForeignKey("words.id"), nullable=False)
    chapter_id = Column(Integer, ForeignKey("chapters.id"), nullable=False)
    correct = Column(Integer, nullable=False)  # 0 or 1 (SQLite has no bool)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_attempt_chapter_time", "chapter_id", "created_at"),
    )

class Sentence(Base):
    """A user-written sentence using a specific target word."""
    __tablename__ = "sentences"
    id = Column(Integer, primary_key=True)
    word_id = Column(Integer, ForeignKey("words.id"), nullable=False)

    user_text = Column(Text, nullable=False)          # what the user wrote
    correct = Column(Integer, nullable=False)          # 0 or 1
    corrected_text = Column(Text)                      # Groq's correction if wrong
    feedback = Column(Text)                            # explanation
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_sentence_word_time", "word_id", "created_at"),
    )