"""
Send German words to an LLM for validation, correction, and translation.
Supports multiple providers (Groq, Gemini) via a provider switch.
"""
import json
import os
import time
from pathlib import Path
from typing import Protocol

from dotenv import load_dotenv

from translation_cache import load_cache, save_cache

load_dotenv(Path(__file__).parent.parent / ".env")

# Which provider to use. Override with PROVIDER env var.
PROVIDER = os.getenv("LLM_PROVIDER", "groq").lower()

BATCH_SIZE = 30
MAX_RETRIES = 4
INITIAL_BACKOFF = 2.0

PROMPT_TEMPLATE = """You are a German language expert helping build a vocabulary app.

I will give you a list of candidate German words extracted from a textbook via OCR.
Some may be misspelled (OCR errors), some may not be real German words at all
(English words, gibberish, proper names with no German meaning).

For each word, return a JSON object or null.

Return null if:
- It's an English word that happens to appear in German text (e.g. "Deal", "Maybe")
- It's gibberish or an OCR artifact that doesn't resolve to a real German word
- It's a standalone proper name with no common German meaning

For valid German words, return:
- "word": the correct spelling (fix OCR errors like "Berghütt" -> "Berghütte",
  modernize old spellings like "Schloß" -> "Schloss")
- "pos": one of "noun", "verb", "adjective", "adverb"
- "article": for nouns only, one of "der", "die", "das". null for others.
- "plural": for nouns only, the plural form. null for others.
- "english": the most common English translation (1-4 words, comma-separated if multiple)
- "example_de": a short, simple German example sentence using the word
- "example_en": English translation of that sentence

IMPORTANT: German geographic names commonly studied (e.g. "Zugspitze", "Alpen",
"Bayern") ARE valid German vocabulary — include them.

Return a JSON object with one key "results" containing a JSON array.
The array length MUST exactly match the input length. Use null for rejected entries.

Input words:
{words}
"""


class LLMProvider(Protocol):
    def generate_json(self, prompt: str) -> str: ...


class GroqProvider:
    def __init__(self):
        from groq import Groq
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY not found in .env")
        self.client = Groq(api_key=api_key)
        self.model = "llama-3.3-70b-versatile"

    def generate_json(self, prompt: str) -> str:
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        return response.choices[0].message.content


class GeminiProvider:
    def __init__(self):
        from google import genai
        from google.genai import types
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY not found in .env")
        self.client = genai.Client(api_key=api_key)
        self.types = types
        self.model = "gemini-2.5-flash"

    def generate_json(self, prompt: str) -> str:
        response = self.client.models.generate_content(
            model=self.model,
            contents=prompt,
            config=self.types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2,
            ),
        )
        return response.text


def _get_provider() -> LLMProvider:
    if PROVIDER == "groq":
        return GroqProvider()
    elif PROVIDER == "gemini":
        return GeminiProvider()
    raise ValueError(f"Unknown provider: {PROVIDER}")


_provider: LLMProvider | None = None

def get_provider() -> LLMProvider:
    global _provider
    if _provider is None:
        _provider = _get_provider()
        print(f"  Using LLM provider: {PROVIDER}")
    return _provider


def _call_llm(words: list[str]) -> list[dict | None]:
    prompt = PROMPT_TEMPLATE.format(words=json.dumps(words, ensure_ascii=False))
    raw = get_provider().generate_json(prompt)
    parsed = json.loads(raw)
    # Both providers return {"results": [...]} because we asked for a JSON object
    results = parsed.get("results", parsed) if isinstance(parsed, dict) else parsed
    if not isinstance(results, list):
        raise ValueError(f"Expected list, got {type(results).__name__}")
    if len(results) != len(words):
        print(f"  Warning: sent {len(words)} words, got {len(results)} results")
    return results


def _call_with_retry(words: list[str]) -> list[dict | None]:
    backoff = INITIAL_BACKOFF
    last_error = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return _call_llm(words)
        except Exception as e:
            last_error = e
            err_msg = str(e).lower()
            is_transient = any(
                code in err_msg
                for code in ["503", "429", "500", "502", "504",
                             "unavailable", "timeout", "overload"]
            )
            if not is_transient or attempt == MAX_RETRIES:
                break
            print(f"  Attempt {attempt} failed ({type(e).__name__}). "
                  f"Retrying in {backoff:.0f}s...")
            time.sleep(backoff)
            backoff *= 2

    print(f"  Batch failed after {MAX_RETRIES} attempts: {last_error}")
    return [None] * len(words)


def translate_batch(words: list[str]) -> list[dict | None]:
    if not words:
        return []

    cache = load_cache()
    to_translate = [w for w in words if w not in cache]
    print(f"  {len(words) - len(to_translate)} cached, {len(to_translate)} new")

    if to_translate:
        total_batches = (len(to_translate) + BATCH_SIZE - 1) // BATCH_SIZE
        for i in range(0, len(to_translate), BATCH_SIZE):
            batch_num = i // BATCH_SIZE + 1
            batch = to_translate[i:i + BATCH_SIZE]
            print(f"  Batch {batch_num}/{total_batches} ({len(batch)} words)...")
            results = _call_with_retry(batch)
            for word, result in zip(batch, results):
                cache[word] = result
        save_cache(cache)

    return [cache.get(w) for w in words]


if __name__ == "__main__":
    test_words = ["Berghütt", "Zugspitze", "gehen", "Maybe", "Schloß", "Deal"]
    print("Testing with:", test_words)
    results = translate_batch(test_words)
    for word, result in zip(test_words, results):
        print(f"{word} -> {result}")