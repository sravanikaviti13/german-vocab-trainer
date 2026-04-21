"""
Spaced repetition scheduler (simplified SM-2 algorithm).
Given a word's current state and whether the user got it right,
compute the next review date.
"""
from datetime import date, timedelta

from app.models import WordProgress


def schedule_next_review(progress: WordProgress, correct: bool) -> None:
    """Mutate progress in-place with new schedule."""
    progress.times_seen += 1
    if correct:
        progress.times_correct += 1

    if not correct:
        # Reset: see it again tomorrow
        progress.interval_days = 1
        progress.strength = max(0, progress.strength - 1)
        progress.ease_factor = max(130, progress.ease_factor - 20)
    else:
        # Progress through intervals: 1 → 3 → 7 → 14 → 30 → 60 → 120 days
        if progress.interval_days == 0:
            progress.interval_days = 1
        elif progress.interval_days == 1:
            progress.interval_days = 3
        else:
            progress.interval_days = int(progress.interval_days * progress.ease_factor / 100)

        progress.strength = min(5, progress.strength + 1)
        progress.ease_factor = min(350, progress.ease_factor + 10)

    from datetime import datetime
    progress.last_reviewed = datetime.utcnow()
    progress.next_review = date.today() + timedelta(days=progress.interval_days)