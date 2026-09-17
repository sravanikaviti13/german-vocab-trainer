"""German NLP: extract candidate vocabulary from raw text."""
import re
from collections import Counter

_nlp = None

GENDER_TO_ARTICLE = {"Masc": "der", "Fem": "die", "Neut": "das"}

def get_nlp():
    global _nlp
    if _nlp is None:
        import spacy
        print("Loading German language model...")
        _nlp = spacy.load("de_core_news_lg")
    return _nlp

def _is_valid(token) -> bool:
    word = token.text
    if not re.match(r"^[a-zA-ZäöüÄÖÜß\-]+$", word):
        return False
    if len(word) < 3:
        return False
    if token.is_oov:
        return False
    if token.pos_ == "NOUN" and not word[0].isupper():
        return False
    return True

def extract_candidates(text: str) -> dict[str, dict]:
    """
    Run spaCy and return a dict of candidates, one per unique (lemma, pos).
    Returns {key: {lemma, pos, article, frequency}}
    """
    nlp = get_nlp()
    doc = nlp(text)

    candidates = {}
    frequencies = Counter()

    for token in doc:
        if token.is_punct or token.is_space or token.is_digit or token.is_stop:
            continue
        if not _is_valid(token):
            continue

        pos = None
        if token.pos_ == "NOUN":
            pos = "noun"
        elif token.pos_ in ("VERB", "AUX"):
            pos = "verb"
        elif token.pos_ == "ADJ":
            pos = "adjective"
        elif token.pos_ == "ADV":
            pos = "adverb"
        else:
            continue

        lemma = token.lemma_.lower()
        if pos == "noun":
            lemma = lemma.capitalize()

        key = f"{lemma}|{pos}"
        frequencies[key] += 1

        if key not in candidates:
            article = None
            if pos == "noun":
                genders = token.morph.get("Gender")
                article = GENDER_TO_ARTICLE.get(genders[0]) if genders else None
            candidates[key] = {"lemma": lemma, "pos": pos, "article": article}

    for key in candidates:
        candidates[key]["frequency"] = frequencies[key]

    return candidates