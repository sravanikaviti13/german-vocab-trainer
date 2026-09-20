"""Pydantic schemas for API request/response validation."""
from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel, ConfigDict


# Shared base
class OrmBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class WordOut(OrmBase):
    id: int
    lemma: str
    pos: str
    article: Optional[str]
    plural: Optional[str]
    english: str
    example_de: Optional[str]
    example_en: Optional[str]


class WordWithProgress(WordOut):
    times_seen: int = 0
    times_correct: int = 0
    strength: int = 0
    next_review: Optional[date] = None


class ChapterOut(OrmBase):
    id: int
    title: str
    page_range: Optional[str]
    created_at: datetime
    word_count: int = 0


class BookOut(OrmBase):
    id: int
    title: str
    language: str
    kind: str = "vocab"
    chapters: list[ChapterOut] = []


class IngestResponse(BaseModel):
    book_id: int
    book_title: str
    chapter_id: int
    chapter_title: str
    words_saved: int
    words_rejected: int


class ReviewIn(BaseModel):
    correct: bool
    override_days: int | None = None  # explicit interval override

class ArticleAttemptIn(BaseModel):
    word_id: int
    chapter_id: int
    correct: bool

class SentenceCheckIn(BaseModel):
    word_id: int
    sentence: str


class SentenceCheckOut(BaseModel):
    correct: bool
    corrected: str
    feedback: str
    meaning_en: str
    stored_id: int


class SentencePromptsOut(BaseModel):
    level: str
    prompts: list[str]


class GrammarTopicIn(BaseModel):
    title: str


class WordManualIn(BaseModel):
    lemma: str
    pos: str  # "noun" | "verb" | "adjective" | "adverb"
    article: Optional[str] = None  # "der" | "die" | "das", nouns only
    plural: Optional[str] = None
    english: str
    example_de: Optional[str] = None
    example_en: Optional[str] = None


class WordBulkIn(BaseModel):
    items: list[WordManualIn]


class WordBulkOut(BaseModel):
    saved: int
    duplicates: int = 0
    words: list[WordOut]