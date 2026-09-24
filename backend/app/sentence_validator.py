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
_MODEL = "openai/gpt-oss-120b"  # llama-3.3-70b-versatile was retired from Groq


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
- A noun's article/determiner is correctly DECLINED for the sentence's case (e.g. neuter "das Kind"
  correctly appearing as "dem Kind" after a dative verb like "helfen", or "des Kindes" in genitive).
  This is correct German, not an error — only the noun's GENDER is fixed, not its surface article.

Mark correct=false for ANY of these errors:
- Wrong grammatical gender for the target noun (e.g. using a masculine/feminine/neuter article
  that doesn't match the noun's actual gender, regardless of case — "der Mädchen" is wrong because
  Mädchen is neuter, not because of case)
- Wrong case after a preposition or case-governing verb. CRITICAL: Two-way prepositions (in, an, auf, hinter, neben, über, unter, vor, zwischen) take ACCUSATIVE for direction/movement and DATIVE for location/state. "Ich wohne in die Wohnung" is WRONG; it must be "in der Wohnung" because "wohnen" describes a location (dative). Likewise, dative verbs (helfen, danken, gefallen, etc.) correctly take a dative object — do not flag that as a wrong article.
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
- "meaning_en": a natural English translation of the FINAL correct sentence (the "corrected" one if wrong, or the student's own sentence if correct).
"""


PROMPTS_TEMPLATE = """You are creating short practice prompts for a learner of German at CEFR level {level}.

Target German word: "{word}" ({pos}) — meaning: "{english}"

Write {count} short ENGLISH sentences that a learner could translate into German. Each one must
naturally require using "{word}" (in whatever grammatical form fits) when translated into German.
Use only vocabulary, topics, and grammar structures appropriate for CEFR level {level} —
nothing more advanced. Keep each sentence to one short clause or two at most. Vary the sentences
(different subjects/situations), don't just restate the same sentence.

Return ONLY a JSON object: {{"prompts": ["sentence 1", "sentence 2", ...]}}
"""


def validate_sentence(word: str, pos: str, english: str, sentence: str,
                      article: str | None = None) -> dict:
    GENDER_NAMES = {"der": "masculine", "die": "feminine", "das": "neuter"}
    article_line = (
        f'This noun\'s grammatical gender is {GENDER_NAMES.get(article, article)} '
        f'(dictionary form: "{article} {word}"). In the student\'s sentence, the article/determiner '
        f'must match this gender, but its FORM should correctly decline for whatever case the '
        f'sentence grammar requires — do not mark it wrong just because it differs from '
        f'"{article}" if that\'s a correct case-declined form (e.g. dative/accusative/genitive).'
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
            "meaning_en": "",
        }

    corrected = str(result.get("corrected", sentence)).strip()
    original = sentence.strip()
    is_correct = bool(result.get("correct", False))
    feedback = str(result.get("feedback", ""))
    meaning_en = str(result.get("meaning_en", "")).strip()

    def normalize(s: str) -> str:
        return " ".join(s.lower().split()).rstrip(".!?")

    if not is_correct and normalize(corrected) == normalize(original):
        is_correct = True
        feedback = "Looks good!"

    return {
        "correct": is_correct,
        "corrected": corrected,
        "feedback": feedback,
        "meaning_en": meaning_en,
    }


def generate_sentence_prompts(word: str, pos: str, english: str, level: str = "A2", count: int = 4) -> list[str]:
    """Generate short English sentences (using the target word) for the learner to translate."""
    prompt = PROMPTS_TEMPLATE.format(word=word, pos=pos, english=english, level=level, count=count)

    response = _client.chat.completions.create(
        model=_MODEL,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.6,
    )

    raw = response.choices[0].message.content
    try:
        result = json.loads(raw)
        prompts = result.get("prompts", [])
    except json.JSONDecodeError:
        prompts = []

    return [str(p).strip() for p in prompts if str(p).strip()][:5]


LOOKUP_PROMPT = """You are a German-English dictionary. The user typed this word: {query}

It may be German or English (a German word may be inflected, e.g. a plural or
a conjugated verb). Return up to 3 of the most likely German dictionary entries.

For each entry give:
- "lemma": the German dictionary form (nouns capitalized, verbs in the infinitive)
- "pos": one of "noun", "verb", "adjective", "adverb", "other"
- "article": nouns only — the nominative singular article, "der", "die" or "das"; otherwise null
- "plural": nouns only — the plural form; otherwise null
- "english": a short English meaning (1-4 words)

If the input is not a real word in either language, return an empty list.
Return ONLY a JSON object: {{"results": [...]}}
"""

_ARTICLES = {"der", "die", "das"}
_POS_VALUES = {"noun", "verb", "adjective", "adverb", "other"}
_LOOKUP_CACHE: dict[str, list[dict]] = {}
_LOOKUP_CACHE_MAX = 256


def lookup_word(query: str) -> list[dict]:
    """Look up a German or English word; return up to 3 German entries with article/plural/meaning."""
    key = " ".join(query.casefold().split())
    if key in _LOOKUP_CACHE:
        return _LOOKUP_CACHE[key]

    prompt = LOOKUP_PROMPT.format(query=json.dumps(query.strip(), ensure_ascii=False))
    response = _client.chat.completions.create(
        model=_MODEL,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.1,
    )

    try:
        raw_results = json.loads(response.choices[0].message.content).get("results", [])
    except (json.JSONDecodeError, AttributeError):
        return []

    results = []
    for item in raw_results[:3] if isinstance(raw_results, list) else []:
        if not isinstance(item, dict):
            continue
        lemma = str(item.get("lemma") or "").strip()
        english = str(item.get("english") or "").strip()
        if not lemma or not english:
            continue

        pos = str(item.get("pos") or "other").strip().lower()
        if pos not in _POS_VALUES:
            pos = "other"

        article = str(item.get("article") or "").strip().lower()
        article = article if pos == "noun" and article in _ARTICLES else None

        plural = str(item.get("plural") or "").strip()
        plural = plural if pos == "noun" and plural.lower() not in {"", "-", "null", "none"} else None

        results.append({
            "lemma": lemma, "pos": pos, "article": article,
            "plural": plural, "english": english,
        })

    if results:  # don't cache empty results — could be a transient bad response
        if len(_LOOKUP_CACHE) >= _LOOKUP_CACHE_MAX:
            _LOOKUP_CACHE.pop(next(iter(_LOOKUP_CACHE)))
        _LOOKUP_CACHE[key] = results
    return results