"""Simple file-based cache for translations. Avoids re-calling Gemini for known words."""
import json
from pathlib import Path

CACHE_FILE = Path(__file__).parent.parent / "translation_cache.json"


def load_cache() -> dict:
    if CACHE_FILE.exists():
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_cache(cache: dict) -> None:
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)