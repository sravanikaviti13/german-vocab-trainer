# German Vocab Trainer

A personal German vocabulary trainer. Upload textbook PDFs and it extracts
the vocabulary automatically, or build your own grammar topic lists by hand.
Practice with four exercise modes, spaced repetition, and AI-checked
sentence writing.

Built as a learning project — open source, free to fork and adapt.

![Library view](./asserts/main_page.png)

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [How it's organized](#how-its-organized)
- [Getting started](#getting-started)
- [Deployment](#deployment)
- [LLM usage and rate limits](#llm-usage-and-rate-limits)
- [Contributing](#contributing)
- [License](#license)

---

## Features

**Two ways to build a word list**

- Upload a PDF chapter. The app OCRs it if needed, extracts vocabulary
  with spaCy, and translates it with an LLM.
- Or build your own **Grammar** topics by hand — e.g. "Dativ verbs" or
  "Modal verbs" — typing words one at a time or pasting a whole list at
  once. Missing example sentences are generated automatically.

  ![Grammar topics list](./asserts/grammar_page.png)

**Four practice modes**, available on both PDF chapters and your own
Grammar topics:

- **Flashcard review** — spaced repetition, "knew it / didn't know".
- **Article drill** — rapid der / die / das quiz, keyboard shortcuts.
- **Matching** — tap a German word, then its English meaning. Every word
  in the set gets used once before any word repeats.
- **Sentence writing** — write a sentence with the target word. An LLM
  checks the grammar, explains what's wrong, and shows the English
  meaning. You can also ask it for A2/B1-level practice prompts.

<table>
<tr>
<td><img src="./asserts/grammar_practice.png" width="380" alt="A grammar topic, with its word list and exercise buttons"><br><em>A grammar topic</em></td>
<td><img src="./asserts/practice.png" width="380" alt="A vocab chapter, same layout, from an uploaded PDF"><br><em>A vocab chapter, from an uploaded PDF</em></td>
</tr>
</table>

**Other things worth knowing**

- Spaced repetition (SM-2 style): words you know go away for longer,
  words you miss come back tomorrow.
- Article mastery is your *most recent* drill session's accuracy, not a
  lifetime average — so it actually reflects what you've forgotten.
- A force-directed graph of your whole vocabulary: node size shows how
  often a word comes up, darkness shows mastery, edges show which words
  share a chapter.
- Light and dark mode.
- Deployed to the cloud so it works other devices.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite, react-force-graph-2d |
| Backend | Python 3.12, FastAPI, SQLAlchemy |
| Database | SQLite for local dev, Supabase Postgres in production |
| NLP | spaCy `de_core_news_lg` for lemmatization, POS tagging, gender |
| OCR | Tesseract (German pack) + Poppler via pdf2image |
| PDF text | pdfplumber, falls back to OCR automatically |
| LLM | Groq API for translation, grammar checking, example sentences |
| Hosting | Vercel (frontend), Render (backend), Supabase (database) |

---

## How it's organized

PDF ingestion (OCR, NLP, translation) runs on your own machine and writes
straight to the cloud database. That keeps Tesseract off the server —
the deployed backend only has to serve practice and review requests,
which keeps it small and fast to cold-start.

```
Your laptop                        Render (backend)             Vercel (frontend)
┌─────────────────┐                ┌─────────────────┐          ┌────────────────┐
│ ingest script   │ ──writes────▶  │ FastAPI        │  ◀─────▶ │ React app     │
│ OCR + NLP + LLM │                │ SQLAlchemy      │          │                │
└─────────────────┘                └───────┬─────────┘          └────────────────┘
                                           │
                                           ▼
                                  ┌────────────────┐
                                  │ Supabase       │
                                  │ Postgres       │
                                  └────────────────┘
```

Grammar topics skip the PDF step entirely — you add words straight
through the app, and they use the same database tables and the same
practice pages as PDF-ingested vocab.

### Database schema

```
books ──< chapters ──< chapter_words >── words
                                          │
                                          ├── word_progress    (SRS state)
                                          ├── article_attempts (drill history)
                                          └── sentences        (written sentences)
```

A word is stored once and shared across chapters — if `der Berg` shows up
in three chapters, there's one row in `words` and three rows in
`chapter_words`. Grammar topics are just a `book` with `kind = "grammar"`,
so they reuse this same schema and every existing exercise page.

---

## Getting started

### Prerequisites

- Python 3.12
- Node.js 20+
- [Tesseract OCR](https://github.com/UB-Mannheim/tesseract/wiki) with the
  German pack (`deu`) — only needed for PDF ingestion
- [Poppler for Windows](https://github.com/oschwartz10612/poppler-windows/releases)
  — same, only for PDF ingestion
- A free [Groq API key](https://console.groq.com/keys)

### 1. Clone the repo

```bash
git clone https://github.com/sravanikaviti13/german-vocab-trainer.git
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
# Leave DATABASE_URL unset to use local SQLite (default).
# Set it to a Postgres URL (e.g. Supabase) to use cloud Postgres instead.
# DATABASE_URL=postgresql://...
```

Start the backend:

```bash
uvicorn app.main:app --reload --port 8000
```

API docs: [http://localhost:8000/docs](http://localhost:8000/docs)

### 3. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

App: [http://localhost:5173](http://localhost:5173)

Create `frontend/.env.local`:

```env
VITE_API_BASE=http://localhost:8000/api
```

### 4. Add some words

Either open **Grammar** in the app and type words in directly, or ingest a
PDF chapter from the command line:

```bash
python scripts/ingest_pdf.py sample_pdf/your_chapter.pdf \
  --book "Your Book Title" \
  --chapter "Chapter Name" \
  --pages 5
```

The script detects whether the PDF is text-based or scanned, OCRs it if
needed, extracts vocabulary with spaCy, translates with Groq, and saves
everything to the database.

---

## Deployment

The app is split across three free tiers: database, backend, frontend.
Ingestion still runs on your own machine and writes straight to the cloud
database — see [How it's organized](#how-its-organized).

### 1. Database — Supabase

Create a project at [supabase.com](https://supabase.com), grab the
**Transaction pooler** connection string, and put it in `backend/.env`:

```env
DATABASE_URL=postgresql://postgres.xxx:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
```

Tables are created (and lightly migrated) automatically the first time
the backend starts.

### 2. Backend — Render

- Root directory: `backend`
- Build command: `pip install -r requirements-prod.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Environment variables: `DATABASE_URL`, `GROQ_API_KEY`,
  `DISABLE_UPLOAD=1`, `LLM_PROVIDER=groq`, and optionally `APP_PASSWORD`
  (see [Protecting your deployment](#protecting-your-deployment))

`requirements-prod.txt` deliberately excludes spaCy, OCR, and PDF
libraries — the hosted backend never runs ingestion (`DISABLE_UPLOAD=1`
turns that endpoint off), so it doesn't need them. That keeps the
deployed image small and the cold-start faster.

Free-tier note: Render sleeps a service after 15 minutes idle. The first
request after that takes 20–40 seconds to wake up. That's a Render
limitation, not something the app can fix from the inside — an
always-on paid instance, or a different host with `min-instances`,
removes it entirely.

### 3. Frontend — Vercel

- Root directory: `frontend`
- Framework: Vite (auto-detected)
- Environment variable:
  `VITE_API_BASE=https://your-backend.onrender.com/api`

### Protecting your deployment

There's no user-account system — anyone with your Vercel/Render URLs can
read and write your data unless you set one thing: `APP_PASSWORD` on the
backend (Render). Once it's set, every API request needs it, and the
frontend shows a one-time password screen (remembered on that browser
via `localStorage`, so you won't be asked again on your own phone).

Leave `APP_PASSWORD` unset for local dev — no gate, no extra step.
Forking and running your own copy is unaffected.

### Adding chapters after deployment

With `DATABASE_URL` pointed at Supabase in your local `.env`, the ingest
script writes straight to the production database. New chapters show up
on your phone as soon as ingestion finishes — no redeploy needed.

---

## LLM usage and rate limits

All LLM calls go through Groq's free developer tier — no credit card,
no per-token billing, just rate limits:

- 30 requests/minute
- 1,000 requests/day
- 8,000 tokens/minute
- 200,000 tokens/day

That's used for: translating ingested vocabulary, checking sentences,
generating example sentences for hand-added words, and generating A2/B1
practice prompts. Translations are cached in
`backend/translation_cache.json`, so a word is only ever sent to the API
once — even across different books and topics.

For personal use — one user, occasional ingestion, daily practice — you
won't come close to these limits.

To use Gemini instead, set `LLM_PROVIDER=gemini` and add a
`GEMINI_API_KEY`. The translator module supports both through the same
interface.

---

## Contributing

Built as a personal tool and a learning project. Contributions are
welcome, especially:

- Better OCR preprocessing for low-quality scans
- More exercise types (fill-in-the-blank, conjugation drills)
- Support for EPUB source files
- Accessibility improvements

Open an issue before a large PR, so we can agree on the approach first.

---

## License

MIT — see [LICENSE](./LICENSE). Free to use, modify, and distribute. If
you build something with this, I'd love to hear about it.

---

## Acknowledgements

- [spaCy](https://spacy.io/) for German NLP
- [Groq](https://groq.com/) for fast, free LLM inference
- [Tesseract OCR](https://github.com/tesseract-ocr/tesseract)
- [react-force-graph-2d](https://github.com/vasturiano/react-force-graph)
- [Supabase](https://supabase.com/), [Render](https://render.com/), and
  [Vercel](https://vercel.com/) for the free tiers that make a project
  like this viable to run for real
