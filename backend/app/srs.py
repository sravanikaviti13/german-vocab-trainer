"""
Spaced repetition scheduler. SM-2-ish.
Supports optional manual override of next interval.
"""
from datetime import date, datetime, timedelta

from app.models import WordProgress


def schedule_next_review(
    progress: WordProgress,
    correct: bool,
    override_days: int | None = None,
) -> None:
    """
    Update progress based on review outcome.
    If override_days is set, use that for next interval instead of the algorithm.
    """
    progress.times_seen += 1
    if correct:
        progress.times_correct += 1

    if override_days is not None:
        # User explicitly chose interval
        progress.interval_days = max(0, override_days)
        if correct:
            progress.strength = min(5, progress.strength + 1)
        # We don't penalize ease for overrides — user knows what they want
    elif not correct:
        progress.interval_days = 1
        progress.strength = max(0, progress.strength - 1)
        progress.ease_factor = max(130, progress.ease_factor - 20)
    else:
        if progress.interval_days == 0:
            progress.interval_days = 1
        elif progress.interval_days == 1:
            progress.interval_days = 3
        else:
            progress.interval_days = int(
                progress.interval_days * progress.ease_factor / 100
            )
        progress.strength = min(5, progress.strength + 1)
        progress.ease_factor = min(350, progress.ease_factor + 10)

    progress.last_reviewed = datetime.utcnow()
    # override_days of 0 means "review again right away" — use today
    progress.next_review = date.today() + timedelta(days=progress.interval_days)