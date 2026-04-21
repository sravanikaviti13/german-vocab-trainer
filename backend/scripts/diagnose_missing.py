"""
Show which words from a PDF got filtered out and why.
Helpful for understanding extraction gaps.
"""
import sys
from pathlib import Path
from collections import Counter

import spacy

from extract_vocab import extract_text_from_pdf, is_probably_valid_german_word

nlp = spacy.load("de_core_news_lg")

pdf_path = Path(sys.argv[1])
max_pages = int(sys.argv[2]) if len(sys.argv) > 2 else 3

text = extract_text_from_pdf(pdf_path, max_pages)
doc = nlp(text)

reasons = Counter()
samples = {"stopword": [], "is_oov": [], "bad_pattern": [], "wrong_pos": [], "too_short": []}

for token in doc:
    if token.is_punct or token.is_space or token.is_digit:
        continue

    # Classify why (if) this token gets filtered
    if token.is_stop:
        reasons["stopword"] += 1
        if token.text.lower() not in [s.lower() for s in samples["stopword"]]:
            samples["stopword"].append(token.text)
    elif not is_probably_valid_german_word(token):
        if len(token.text) < 3:
            reasons["too_short"] += 1
        elif token.is_oov:
            reasons["is_oov"] += 1
            if token.text not in samples["is_oov"]:
                samples["is_oov"].append(token.text)
        else:
            reasons["bad_pattern"] += 1
            if token.text not in samples["bad_pattern"]:
                samples["bad_pattern"].append(token.text)
    elif token.pos_ not in ("NOUN", "VERB", "AUX", "ADJ", "ADV"):
        reasons["wrong_pos"] += 1
        if token.text not in samples["wrong_pos"]:
            samples["wrong_pos"].append(f"{token.text} ({token.pos_})")

print("\n=== FILTERED OUT ===\n")
for reason, count in reasons.most_common():
    print(f"{reason}: {count} tokens")
    # Show up to 30 unique examples
    print(f"  examples: {samples[reason][:30]}")
    print()