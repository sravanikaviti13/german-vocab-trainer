"""
Extract German vocabulary from a PDF file.
Groups words into nouns (with articles), verbs, adjectives, and other.
"""
import sys
from pathlib import Path
from collections import defaultdict

import pdfplumber
import spacy

# Load German NLP model once
print("Loading German language model...")
nlp = spacy.load("de_core_news_lg")

# Map spaCy's gender tags to German articles
GENDER_TO_ARTICLE = {
    "Masc": "der",
    "Fem": "die",
    "Neut": "das",
}


def extract_text_from_pdf(pdf_path: Path, max_pages: int = 10) -> str:
    """Pull all text out of a PDF, capped at max_pages."""
    text_parts = []
    with pdfplumber.open(pdf_path) as pdf:
        pages_to_read = pdf.pages[:max_pages]
        print(f"Reading {len(pages_to_read)} pages from {pdf_path.name}")
        for page in pages_to_read:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
    return "\n".join(text_parts)


def extract_vocabulary(text: str) -> dict:
    """Run text through spaCy and group words by part of speech."""
    doc = nlp(text)

    # Use sets to automatically deduplicate
    vocab = {
        "nouns": {},       # lemma -> article
        "verbs": set(),
        "adjectives": set(),
        "other": set(),
    }

    for token in doc:
        # Skip punctuation, numbers, spaces, stopwords
        if token.is_punct or token.is_space or token.is_digit:
            continue
        if token.is_stop or len(token.lemma_) < 2:
            continue

        lemma = token.lemma_.lower()

        if token.pos_ == "NOUN":
            # Get gender from morphological features
            genders = token.morph.get("Gender")
            article = GENDER_TO_ARTICLE.get(genders[0], "?") if genders else "?"
            # Capitalize nouns (German convention)
            vocab["nouns"][lemma.capitalize()] = article

        elif token.pos_ == "VERB" or token.pos_ == "AUX":
            vocab["verbs"].add(lemma)

        elif token.pos_ == "ADJ":
            vocab["adjectives"].add(lemma)

        elif token.pos_ in ("ADV",):
            vocab["other"].add(lemma)

    return vocab


def print_vocabulary(vocab: dict) -> None:
    """Pretty-print the results."""
    print("\n" + "=" * 50)
    print(f"NOUNS ({len(vocab['nouns'])})")
    print("=" * 50)
    for noun, article in sorted(vocab["nouns"].items()):
        print(f"  {article} {noun}")

    print("\n" + "=" * 50)
    print(f"VERBS ({len(vocab['verbs'])})")
    print("=" * 50)
    for verb in sorted(vocab["verbs"]):
        print(f"  {verb}")

    print("\n" + "=" * 50)
    print(f"ADJECTIVES ({len(vocab['adjectives'])})")
    print("=" * 50)
    for adj in sorted(vocab["adjectives"]):
        print(f"  {adj}")


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
    print_vocabulary(vocab)


if __name__ == "__main__":
    main()