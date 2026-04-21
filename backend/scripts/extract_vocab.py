"""
Extract German vocabulary from a PDF file.
Auto-detects scanned PDFs and falls back to OCR.
"""
import sys
import re
from pathlib import Path

import pdfplumber
import pytesseract
from pdf2image import convert_from_path
import spacy

import os
import shutil

from translator import translate_batch

# --- Windows paths  ---
# Look for Tesseract in common Windows install locations, then fall back to PATH
_TESSERACT_CANDIDATES = [
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe"),
    shutil.which("tesseract"),  # if it's on PATH
]
TESSERACT_PATH = next((p for p in _TESSERACT_CANDIDATES if p and os.path.exists(p)), None)

if TESSERACT_PATH:
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH
else:
    print("WARNING: Tesseract not found. OCR will fail if the PDF needs it.")

_POPPLER_CANDIDATES = [
    r"C:\poppler\Library\bin",
    r"C:\Program Files\poppler\Library\bin",
    os.path.expandvars(r"%LOCALAPPDATA%\Programs\poppler\Library\bin"),
]
POPPLER_PATH = next((p for p in _POPPLER_CANDIDATES if os.path.exists(p)), None)

pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH

print("Loading German language model...")
nlp = spacy.load("de_core_news_lg")

GENDER_TO_ARTICLE = {"Masc": "der", "Fem": "die", "Neut": "das"}


def extract_text_native(pdf_path: Path, max_pages: int) -> str:
    """Try to extract text directly (fast, works for real text PDFs)."""
    parts = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages[:max_pages]:
            text = page.extract_text()
            if text:
                parts.append(text)
    return "\n".join(parts)

def extract_text_ocr(pdf_path: Path, max_pages: int) -> str:
    """Convert PDF pages to images, then OCR them in German."""
    print("  No text found — running OCR (this takes ~5–10 sec per page)...")
    images = convert_from_path(
        pdf_path,
        first_page=1,
        last_page=max_pages,
        poppler_path=POPPLER_PATH,
        dpi=300,  # higher dpi = better accuracy, slower
    )
    parts = []
    for i, image in enumerate(images, start=1):
        print(f"  OCR page {i}/{len(images)}...")
        text = pytesseract.image_to_string(image, lang="deu")
        parts.append(text)
    return "\n".join(parts)

def clean_ocr_text(text: str) -> str:
    """Fix common OCR issues before NLP processing."""
    # Rejoin hyphenated words split across line breaks
    # e.g. "Deutsch-\nunterricht" -> "Deutschunterricht"
    text = re.sub(r"-\s*\n\s*", "", text)

    # Collapse multiple whitespace into single space
    text = re.sub(r"\s+", " ", text)

    return text

def extract_text_from_pdf(pdf_path: Path, max_pages: int = 10) -> str:
    """Try native extraction first, fall back to OCR if PDF is scanned."""
    print(f"Reading up to {max_pages} pages from {pdf_path.name}")
    text = extract_text_native(pdf_path, max_pages)

    # If we got very little text, it's probably scanned
    if len(text.strip()) < 50:
        text = extract_text_ocr(pdf_path, max_pages)

    text = clean_ocr_text(text) 
    print(f"  Extracted {len(text)} characters")
    return text


def is_probably_valid_german_word(token) -> bool:
    """Reject tokens that don't look like real German words."""
    word = token.text
    lemma = token.lemma_

    # Letters only (allow umlauts, ß, internal hyphens)
    if not re.match(r"^[a-zA-ZäöüÄÖÜß\-]+$", word):
        return False

    # At least 3 characters
    if len(word) < 3:
        return False

    # spaCy knows this word from its German training corpus
    # (rejects most OCR garbage and English contaminants)
    if token.is_oov:
        return False

    # German nouns are always capitalized in correct text
    # If spaCy tagged something as a noun but it's lowercase in the source,
    # it's probably an OCR error or misclassification
    if token.pos_ == "NOUN" and not word[0].isupper():
        return False

    # Catch words ending in weird OCR artifacts
    # e.g. "Berghütt" (missing e), "Burge" (wrong plural form)
    # These often have lemmas equal to themselves (no proper lemmatization happened)
    # We'll let Gemini catch these later — skip this heuristic for now

    return True

def extract_vocabulary(text: str) -> dict:
    doc = nlp(text)
    vocab = {"nouns": {}, "verbs": set(), "adjectives": set(), "other": set()}

    for token in doc:
        if token.is_punct or token.is_space or token.is_digit:
            continue
        if token.is_stop:
            continue
        if not is_probably_valid_german_word(token):
            continue

        lemma = token.lemma_.lower()

        if token.pos_ == "NOUN":
            genders = token.morph.get("Gender")
            article = GENDER_TO_ARTICLE.get(genders[0], "?") if genders else "?"
            vocab["nouns"][lemma.capitalize()] = article
        elif token.pos_ in ("VERB", "AUX"):
            vocab["verbs"].add(lemma)
        elif token.pos_ == "ADJ":
            vocab["adjectives"].add(lemma)
        elif token.pos_ == "ADV":
            vocab["other"].add(lemma)

    return vocab

def enrich_with_translations(vocab: dict) -> dict:
    """Send all candidate words to Gemini for validation + translation."""
    # Flatten all words into one list
    candidates = []
    candidates.extend(vocab["nouns"].keys())
    candidates.extend(vocab["verbs"])
    candidates.extend(vocab["adjectives"])

    print(f"\nSending {len(candidates)} words to Gemini...")
    results = translate_batch(candidates)

    enriched = {"nouns": {}, "verbs": {}, "adjectives": {}}
    for word, data in zip(candidates, results):
        if data is None:
            continue  # Gemini rejected this as not real German

        pos = data.get("pos")
        entry = {
            "english": data.get("english"),
            "example_de": data.get("example_de"),
            "example_en": data.get("example_en"),
        }

        if pos == "noun":
            entry["article"] = data.get("article")
            entry["plural"] = data.get("plural")
            enriched["nouns"][data["word"]] = entry
        elif pos == "verb":
            enriched["verbs"][data["word"]] = entry
        elif pos == "adjective":
            enriched["adjectives"][data["word"]] = entry

    return enriched

def print_vocabulary(vocab: dict) -> None:
    print("\n" + "=" * 60)
    print(f"NOUNS ({len(vocab['nouns'])})")
    print("=" * 60)
    for noun, data in sorted(vocab["nouns"].items()):
        article = data.get("article", "?")
        english = data.get("english", "")
        print(f"  {article} {noun:25s} → {english}")
        if data.get("example_de"):
            print(f"      e.g. {data['example_de']}")

    print("\n" + "=" * 60)
    print(f"VERBS ({len(vocab['verbs'])})")
    print("=" * 60)
    for verb, data in sorted(vocab["verbs"].items()):
        english = data.get("english", "")
        print(f"  {verb:25s} → {english}")

    print("\n" + "=" * 60)
    print(f"ADJECTIVES ({len(vocab['adjectives'])})")
    print("=" * 60)
    for adj, data in sorted(vocab["adjectives"].items()):
        english = data.get("english", "")
        print(f"  {adj:25s} → {english}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python extract_vocab.py <path_to_pdf> [max_pages]")
        sys.exit(1)

    pdf_path = Path(sys.argv[1])
    max_pages = int(sys.argv[2]) if len(sys.argv) > 2 else 10

    if not pdf_path.exists():
        print(f"File not found: {pdf_path}")
        sys.exit(1)

    text = extract_text_from_pdf(pdf_path, max_pages)
    vocab = extract_vocabulary(text)
    enriched = enrich_with_translations(vocab)
    print_vocabulary(enriched)


if __name__ == "__main__":
    main()