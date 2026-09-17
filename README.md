# 🇩🇪 German Vocab Trainer

A personal German vocabulary learning app that extracts vocabulary from textbook PDFs, organizes it by grammar category, and lets you practice through multiple exercise modes — with spaced repetition, AI-powered sentence validation, and a live vocabulary network graph.

Built as an open-source project for German learners at any level.

![Library view showing books and chapters](./asserts/Library.png)
![Practice view showing chapter](./asserts/practice.png)
---

## Features

- **PDF ingestion** — upload a scanned or text-based PDF chapter; the app OCRs it, extracts vocabulary, and translates it automatically
- **Organized by grammar** — words are grouped into nouns (with articles), verbs, adjectives, and adverbs
- **Four practice modes:**
  - **Flipcard review** — classic spaced repetition with a "knew it / didn't know" flow
  - **Article drill** — rapid-fire der / die / das quiz for nouns (keyboard shortcuts supported)
  - **Matching** — click a German word, click its English meaning; first-try accuracy tracked separately
  - **Sentence writing** — write a sentence using the target word; Groq AI checks grammar and gives specific feedback
- **Spaced repetition** — SM-2-style scheduling. Words you know go away for days; words you miss come back tomorrow. Optional per-word schedule override.
- **Article mastery tracking** — the Articles button shows your accuracy from the most recent drill session (not a lifetime average that hides forgetting)
- **Vocabulary network graph** — force-directed graph where node size = usage, darkness = mastery, edges = chapter co-occurrence. Zoom in to see labels. Click a node for word details.
- **Cloud deployment** — frontend on Vercel, backend on Render, database on Supabase Postgres. Mobile-friendly.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite, react-force-graph-2d |
| Backend | Python 3.12, FastAPI, SQLAlchemy |
| Database | SQLite (local dev) → Supabase Postgres (production) |
| NLP | spaCy `de_core_news_lg` — lemmatization, POS tagging, gender detection |
| OCR | Tesseract (German language pack) + Poppler via pdf2image |
| PDF text extraction | pdfplumber (falls back to OCR automatically) |
| LLM | Groq API — `llama-3.3-70b-versatile` for translations and sentence validation |
| Deployment | Vercel (frontend), Render (backend), Supabase (database) |

---

## Architecture

```
┌─────────────────────┐        ┌──────────────────────────┐
│  Frontend (Vercel)  │──────▶│  Backend (Render)         │
│  React + Vite       │        │  FastAPI + SQLAlchemy     │
└─────────────────────┘        └──────────────┬───────────┘
                                              │
                                              ▼
                                ┌──────────────────────────┐
                                │  Supabase Postgres        │
                                │  (cloud database)         │
                                └──────────────▲───────────┘
                                              │
                                ┌─────────────┴──────────┐
                                │  Your laptop            │
                                │  Runs ingest script     │
                                │  (OCR + translation)    │
                                └────────────────────────┘
```

PDF ingestion (OCR, NLP, translation) runs locally and writes directly to the cloud database. The deployed backend handles all practice and review. This avoids the complexity of running Tesseract on a cloud server.

---

## Getting Started

### Prerequisites

- Python 3.12
- Node.js 20+
- [Tesseract OCR](https://github.com/UB-Mannheim/tesseract/wiki) with the German language pack (`deu`) installed
- [Poppler for Windows](https://github.com/oschwartz10612/poppler-windows/releases) (for PDF-to-image conversion)
- A free [Groq API key](https://console.groq.com/keys)

### 1. Clone the repo

```bash
git clone https://github.com/your-username/german-vocab-trainer.git
cd german-vocab-trainer
```

### 2. Backend setup

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# Mac/Linux
source venv/bin/activate

pip install -r requirements.txt
python -m spacy download de_core_news_lg
```

Create `backend/.env`:

```env
GROQ_API_KEY=your_groq_key_here
LLM_PROVIDER=groq
# Leave DATABASE_URL blank to use local SQLite (default)
# DATABASE_URL=postgresql://...  ← add this for cloud Postgres
```

Start the backend:

```bash
uvicorn app.main:app --reload --port 8000
```

API docs available at [http://localhost:8000/docs](http://localhost:8000/docs)

### 3. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

App available at [http://localhost:5173](http://localhost:5173)

Create `frontend/.env.local`:

```env
VITE_API_BASE=http://localhost:8000/api
```

### 4. Ingest your first chapter

Put a German PDF in `backend/sample_pdf/` and run:

```bash
python scripts/ingest_pdf.py sample_pdf/your_chapter.pdf \
  --book "Your Book Title" \
  --chapter "Chapter Name" \
  --pages 5
```

The script auto-detects whether the PDF is text-based or scanned, runs OCR if needed, extracts vocabulary with spaCy, translates using Groq, and saves everything to the database.

---

## Project Structure

```
german-vocab-trainer/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI routes
│   │   ├── models.py            # SQLAlchemy ORM models
│   │   ├── schemas.py           # Pydantic request/response schemas
│   │   ├── db.py                # Database connection (SQLite or Postgres)
│   │   ├── ingest.py            # Ingestion pipeline orchestrator
│   │   ├── extractor.py         # PDF text extraction + OCR
│   │   ├── nlp.py               # spaCy NLP pipeline
│   │   ├── translator.py        # Groq/Gemini LLM client with batching + cache
│   │   ├── sentence_validator.py# German grammar checker via Groq
│   │   ├── srs.py               # Spaced repetition scheduler (SM-2)
│   │   └── translation_cache.py # File-based JSON cache for translations
│   ├── scripts/
│   │   ├── ingest_pdf.py        # CLI entry point for ingestion
│   │   ├── show_db.py           # Quick DB summary
│   │   └── migrate_to_postgres.py # One-time SQLite → Postgres migration
│   ├── requirements.txt
│   ├── runtime.txt              # Pins Python 3.12 for Render
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Library.jsx       # Book/chapter list
│   │   │   ├── ChapterDetail.jsx # Chapter overview with POS sections
│   │   │   ├── Upload.jsx        # PDF upload form
│   │   │   ├── Practice.jsx      # Flipcard review with SRS
│   │   │   ├── ArticleDrill.jsx  # der/die/das drill
│   │   │   ├── Matching.jsx      # Matching exercise
│   │   │   ├── SentencePractice.jsx # Sentence writing with AI feedback
│   │   │   └── Graph.jsx         # Vocabulary network graph
│   │   ├── api.js                # Axios API client
│   │   └── App.jsx               # Router
│   └── package.json
└── README.md
```

---

## Database Schema

```
books ──< chapters ──< chapter_words >── words
                                          │
                                          ├── word_progress   (SRS state)
                                          ├── article_attempts (drill history)
                                          └── sentences        (written sentences)
```

Words are stored once and shared across chapters. If `der Berg` appears in three chapters, there's one row in `words` and three rows in `chapter_words`. This enables the cross-chapter network graph and avoids translation duplication.

---

## Deployment

### Cloud deployment (recommended for mobile access)

The app uses a split deployment: ingestion runs locally (OCR stays on your machine), everything else is cloud-hosted.

**1. Database — Supabase (free)**

Create a project at [supabase.com](https://supabase.com), get the Transaction pooler connection string, and add it to `backend/.env`:

```env
DATABASE_URL=postgresql://postgres.xxx:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
```

Run the ingest script once — tables are created automatically on first run.

**2. Backend — Render (free tier)**

- Root Directory: `backend`
- Build Command: `pip install -r requirements-prod.txt`
- Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Environment variables: `DATABASE_URL`, `GROQ_API_KEY`, `DISABLE_UPLOAD=1`, `LLM_PROVIDER=groq`

Note: free tier sleeps after 15 minutes of inactivity. First request after idle takes ~30 seconds to wake up.

**3. Frontend — Vercel (free)**

- Root Directory: `frontend`
- Framework: Vite (auto-detected)
- Environment variable: `VITE_API_BASE=https://your-backend.onrender.com/api`

**Ingesting new chapters after deployment**

With `DATABASE_URL` pointing at Supabase in your local `backend/.env`, the ingest script writes directly to the cloud database. Your phone sees new chapters immediately after ingest finishes.

```bash
python scripts/ingest_pdf.py new_chapter.pdf --book "My Book" --chapter "Chapter 3" --pages 5
```

---

## How Spaced Repetition Works

Words start with `interval_days = 0` (review today). After each practice session:

| Outcome | Next review |
|---|---|
| Correct (first time) | 1 day |
| Correct (again) | 3 days → 7 → 14 → 30 → 60 → 120 |
| Wrong | 1 day (reset) |
| Manual override | Your chosen interval |

The "re-queue wrong answers" toggle in the session setup re-adds missed words to the end of the current session queue — so you see them again within minutes, before the long-term scheduler takes over.

---

## How Article Mastery Works

The Articles button on each chapter shows your accuracy from the **most recent article drill session only** — not a lifetime average. A session is a contiguous block of attempts with no gap longer than 30 minutes.

This means if you drilled 80% yesterday and 50% today, you see 50% — a clear signal that you've forgotten and need to re-drill. Lifetime averages would hide this.

---

## LLM Usage and Rate Limits

All LLM calls go through Groq's free tier:

| Use case | Model | Free tier limit |
|---|---|---|
| Vocabulary translation (ingest) | `llama-3.3-70b-versatile` | 1,000 req/day |
| Sentence validation (practice) | `llama-3.3-70b-versatile` | 1,000 req/day |

Translation results are cached to `backend/translation_cache.json`. Once a word is translated, it's never sent to the API again — even across different books and chapters.

For personal use (one user, occasional ingestion, daily practice), you will not hit rate limits.

To switch providers, set `LLM_PROVIDER=gemini` in `.env` and add a `GEMINI_API_KEY`. The translator module supports both providers with the same interface.

---

## Contributing

This project was built as a personal tool and learning exercise. Contributions welcome — especially:

- Better OCR preprocessing (deskew, denoise for low-quality scans)
- Mobile-optimized CSS for the graph and chapter views  
- Support for EPUB files (German ebooks)
- More exercise types (fill-in-the-blank, conjugation drills)

Open an issue to discuss before submitting a large PR.

---

## License

MIT — free to use, modify, and distribute. If you build something with this, I'd love to hear about it.

---

## Acknowledgements

- [spaCy](https://spacy.io/) for German NLP
- [Groq](https://groq.com/) for fast, free LLM inference
- [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) for text recognition
- [react-force-graph-2d](https://github.com/vasturiano/react-force-graph) for the vocabulary graph
- [Supabase](https://supabase.com/), [Render](https://render.com/), and [Vercel](https://vercel.com/) for free hosting tiers that make personal projects like this viable
