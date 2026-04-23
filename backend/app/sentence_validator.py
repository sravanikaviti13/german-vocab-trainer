"""
Send a user-written German sentence to Groq for grammar + usage validation.
Returns structured feedback.
"""
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from groq import Groq

load_dotenv(Path(__file__).parent.parent / ".env")

_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
#_MODEL = "llama-3.1-8b-instant"  # fast + generous rate limits for this task
_MODEL = "llama-3.3-70b-versatile"


PROMPT = """You are evaluating a German learner's sentence. Be FAIR and STRICT in that order.

Target word: "{word}"
Part of speech: {pos}
Meaning: {english}
{article_line}

Student's sentence: "{sentence}"

RULES FOR YOUR JUDGMENT:

Mark correct=true if:
- The sentence is grammatically valid German (articles, case, conjugation, word order, prepositions)
- The target word "{word}" appears in a grammatically correct form
- A native speaker would understand it without confusion
- It is complete (has subject + verb, or is a valid short expression)

Mark correct=true EVEN IF:
- The sentence is simple or unremarkable
- There is a more natural or idiomatic phrasing (style preferences are NOT errors)
- The sentence contains redundant words that are still grammatically valid
- The sentence uses proper nouns, numbers, or borrowed words

Mark correct=false for ANY of these errors:
- Wrong article for the target word (e.g. "der Wohnung" when it should be "die Wohnung")
- Wrong case after a preposition. CRITICAL: Two-way prepositions (in, an, auf, hinter, neben, über, unter, vor, zwischen) take ACCUSATIVE for direction/movement and DATIVE for location/state. "Ich wohne in die Wohnung" is WRONG; it must be "in der Wohnung" because "wohnen" describes a location (dative).
- Verb conjugation error (subject-verb agreement)
- Missing required preposition. Time expressions usually need "um" (e.g. "um 9 Uhr"), "am" (e.g. "am Montag"), or "im" (e.g. "im Sommer").
- Wrong word order that breaks German grammar rules
- Missing required subject or verb
- The target word is used with wrong meaning or form
- Severe spelling errors that change the word

CRITICAL: Do NOT invent rules. Do NOT mark correct sentences wrong because of style.
But DO catch real grammar errors — especially article errors and wrong prepositions/cases.

Return ONLY a JSON object:
- "correct": true or false
- "corrected": if false, the fixed version. If true, repeat the student's sentence unchanged.
- "feedback": one short English sentence (≤25 words). If correct, brief encouragement. If wrong, name the SPECIFIC error.
"""


def validate_sentence(word: str, pos: str, english: str, sentence: str,
                      article: str | None = None) -> dict:
    article_line = (
        f'The correct article for this noun is: "{article}". Any other article is wrong.'
        if article and pos == "noun"
        else ""
    )
    prompt = PROMPT.format(
        word=word,
        pos=pos,
        english=english,
        article_line=article_line,
        sentence=sentence.strip(),
    )

    response = _client.chat.completions.create(
        model=_MODEL,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.2,
    )

    raw = response.choices[0].message.content
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        return {
            "correct": False,
            "corrected": sentence,
            "feedback": "Sorry, I couldn't analyze that. Please try again.",
        }

    corrected = str(result.get("corrected", sentence)).strip()
    original = sentence.strip()
    is_correct = bool(result.get("correct", False))
    feedback = str(result.get("feedback", ""))

    def normalize(s: str) -> str:
        return " ".join(s.lower().split()).rstrip(".!?")

    if not is_correct and normalize(corrected) == normalize(original):
        is_correct = True
        feedback = "Looks good!"

    return {
        "correct": is_correct,
        "corrected": corrected,
        "feedback": feedback,
    }