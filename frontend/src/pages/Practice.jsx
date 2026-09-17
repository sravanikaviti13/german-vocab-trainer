import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { getChapterWordsFiltered, recordReview } from "../api";

export default function Practice() {
  const { chapterId } = useParams();
  const [searchParams] = useSearchParams();
  const posFilter = searchParams.get("pos"); // null or "noun" etc.
  const [allWords, setAllWords] = useState([]);
  const [loading, setLoading] = useState(true);

  // Session setup
  const [sessionStarted, setSessionStarted] = useState(false);
  const [requeueWrong, setRequeueWrong] = useState(true);

  // Session state
  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState([]); // for back button: [{word, correct}]
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    getChapterWordsFiltered(chapterId, posFilter)
      .then(setAllWords)
      .finally(() => setLoading(false));
  }, [chapterId, posFilter]);

  if (loading) return <p>Loading...</p>;
  if (allWords.length === 0) return <p>No words in this chapter.</p>;

  // --- Session setup screen ---
  if (!sessionStarted) {
    return (
      <div style={styles.setup}>
        <h2>Practice session</h2>
        <p style={styles.muted}>
          {allWords.length} {posFilter ? `${posFilter}s` : "words"} in this chapter
        </p>

        <label style={styles.toggle}>
          <input
            type="checkbox"
            checked={requeueWrong}
            onChange={(e) => setRequeueWrong(e.target.checked)}
          />
          <span>
            <strong>Re-queue wrong answers</strong>
            <span style={styles.mutedSmall}>
              {" "}— if you miss a word, see it again later in this session
            </span>
          </span>
        </label>

        <button
          onClick={() => {
            setQueue([...allWords].sort(() => Math.random() - 0.5));
            setSessionStarted(true);
          }}
          style={styles.primaryButton}
        >
          Start practice
        </button>
        <Link to="/" style={styles.backLink}>
          ← Cancel
        </Link>
      </div>
    );
  }

  const correctCount = history.filter((h) => h.correct).length;
  const wrongCount = history.filter((h) => !h.correct).length;

  // --- Session complete ---
  if (index >= queue.length) {
    return (
      <div style={styles.done}>
        <h2>Session complete!</h2>
        <p style={styles.stat}>
          <span style={{ color: "#2e7d32" }}>✓ {correctCount}</span>
          {"  "}·{"  "}
          <span style={{ color: "#c33" }}>✗ {wrongCount}</span>
        </p>
        <p style={styles.muted}>{queue.length} cards reviewed</p>
        <Link to="/" style={styles.backLink}>
          ← Back to library
        </Link>
      </div>
    );
  }

  const word = queue[index];

  async function answer(correct, overrideDays = null) {
    let result = null;
    try {
      result = await recordReview(word.id, correct, overrideDays);
    } catch (err) {
      console.error("Failed to record review:", err);
    }

    // Re-queue if wrong, no override, and option is on
    let newQueue = queue;
    if (!correct && requeueWrong && overrideDays === null) {
      newQueue = [...queue, word];
      setQueue(newQueue);
    }

    setHistory([
      ...history,
      {
        word,
        correct,
        overrideDays,
        nextReview: result?.next_review,
      },
    ]);
    setRevealed(false);
    setIndex(index + 1);
  }

  function goBack() {
    if (history.length === 0) return;
    // Pop the last entry, restore state
    const last = history[history.length - 1];
    setHistory(history.slice(0, -1));
    setIndex(index - 1);
    setRevealed(false);

    // If we re-queued that word earlier, remove it from the tail of queue
    if (!last.correct && requeueWrong) {
      // The last item of queue will be this word (most recent re-queue)
      const q = [...queue];
      // find last occurrence of this word id from the back
      for (let i = q.length - 1; i > index - 1; i--) {
        if (q[i].id === last.word.id) {
          q.splice(i, 1);
          break;
        }
      }
      setQueue(q);
    }
    // Note: we don't un-record the review on the backend. That's a feature,
    // not a bug — going back lets you re-study, but the stats still count.
  }

  return (
    <div style={styles.container}>
      {/* Header: progress + live stats */}
      <div style={styles.header}>
        <span style={styles.progress}>
          {index + 1} / {queue.length}
        </span>
        <span style={styles.liveStats}>
          <span style={{ color: "#2e7d32" }}>✓ {correctCount}</span>
          {"  "}
          <span style={{ color: "#c33" }}>✗ {wrongCount}</span>
        </span>
      </div>

      <div style={styles.card}>
        <div style={styles.front}>
          {word.article && <span style={styles.article}>{word.article}</span>}
          <h1 style={styles.lemma}>{word.lemma}</h1>
          <p style={styles.pos}>{word.pos}</p>
        </div>

        {revealed ? (
          <div style={styles.back}>
            <hr style={styles.hr} />
            <p style={styles.english}>{word.english}</p>
            {word.plural && <p style={styles.plural}>pl. {word.plural}</p>}
            {word.example_de && (
              <div style={styles.example}>
                <p>{word.example_de}</p>
                <p style={styles.exampleEn}>{word.example_en}</p>
              </div>
            )}
            <div style={styles.buttons}>
              <button onClick={() => answer(false)} style={styles.wrong}>
                Didn't know
              </button>
              <button onClick={() => answer(true)} style={styles.correct}>
                Knew it
              </button>
            </div>

            <div style={styles.overrideRow}>
              <span style={styles.overrideLabel}>Or schedule manually:</span>
              <button onClick={() => answer(false, 0)} style={styles.overrideBtn} title="Again today">
                Again
              </button>
              <button onClick={() => answer(true, 1)} style={styles.overrideBtn}>
                1d
              </button>
              <button onClick={() => answer(true, 3)} style={styles.overrideBtn}>
                3d
              </button>
              <button onClick={() => answer(true, 7)} style={styles.overrideBtn}>
                7d
              </button>
              <button onClick={() => answer(true, 30)} style={styles.overrideBtn}>
                30d
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setRevealed(true)} style={styles.reveal}>
            Reveal
          </button>
        )}
      </div>

      {/* Footer controls */}
      <div style={styles.footer}>
        <button
          onClick={goBack}
          disabled={history.length === 0}
          style={{
            ...styles.secondaryButton,
            opacity: history.length === 0 ? 0.4 : 1,
            cursor: history.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          ← Previous
        </button>
        <Link to="/" style={styles.backLink}>
          End session
        </Link>
      </div>
    </div>
  );
}

const styles = {
  container: { maxWidth: 600, margin: "0 auto" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 12,
    color: "var(--color-text-muted)",
    fontSize: "0.9rem",
  },
  progress: {},
  liveStats: { fontWeight: 500 },
  card: {
    background: "var(--color-surface)",
    borderRadius: 12,
    padding: 32,
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
    textAlign: "center",
    minHeight: 280,
  },
  front: { padding: "24px 0" },
  article: { color: "var(--color-link)", fontSize: "1.2rem", marginRight: 8 },
  lemma: { fontSize: "2.5rem", fontWeight: 500, marginBottom: 8 },
  pos: { color: "var(--color-text-muted)", fontSize: "0.9rem", textTransform: "uppercase" },
  reveal: {
    padding: "12px 24px",
    background: "var(--color-surface-alt)",
    color: "var(--color-text)",
    border: "none",
    borderRadius: 8,
    fontSize: "1rem",
    marginTop: 12,
  },
  hr: { border: "none", borderTop: "1px solid var(--color-border-soft)", margin: "20px 0" },
  back: {},
  english: { fontSize: "1.4rem", marginBottom: 8 },
  plural: { color: "var(--color-text-secondary)", fontSize: "0.95rem" },
  example: { background: "var(--color-surface-alt)", padding: 12, borderRadius: 8, margin: "16px 0" },
  exampleEn: { color: "var(--color-text-muted)", fontSize: "0.9rem", marginTop: 4, fontStyle: "italic" },
  buttons: { display: "flex", gap: 12, justifyContent: "center", marginTop: 20 },
  wrong: {
    padding: "10px 20px", background: "rgba(204, 51, 51, 0.15)", color: "#c33",
    border: "none", borderRadius: 8, fontSize: "1rem",
  },
  correct: {
    padding: "10px 20px", background: "rgba(46, 125, 50, 0.15)", color: "#2e7d32",
    border: "none", borderRadius: 8, fontSize: "1rem",
  },

  footer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
  },
  secondaryButton: {
    padding: "8px 16px",
    background: "var(--color-surface)",
    color: "var(--color-text-secondary)",
    border: "1px solid var(--color-border)",
    borderRadius: 6,
    fontSize: "0.9rem",
  },
  backLink: { color: "var(--color-text-muted)", fontSize: "0.9rem" },

  setup: {
    maxWidth: 500,
    margin: "40px auto",
    background: "var(--color-surface)",
    padding: 32,
    borderRadius: 12,
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  },
  toggle: {
    display: "flex",
    alignItems: "start",
    gap: 10,
    padding: 16,
    background: "var(--color-surface-alt)",
    borderRadius: 8,
    margin: "20px 0",
    cursor: "pointer",
  },
  primaryButton: {
    padding: "12px 24px",
    background: "var(--color-accent)",
    color: "var(--color-accent-contrast)",
    border: "none",
    borderRadius: 8,
    fontSize: "1rem",
    width: "100%",
  },
  muted: { color: "var(--color-text-secondary)", marginBottom: 16 },
  mutedSmall: { color: "var(--color-text-muted)", fontSize: "0.9rem" },
  done: {
    textAlign: "center",
    padding: 40,
    background: "var(--color-surface)",
    borderRadius: 12,
    maxWidth: 400,
    margin: "40px auto",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  },
  stat: { fontSize: "1.4rem", margin: "16px 0", fontWeight: 500 },

  overrideRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
    marginTop: 14,
    flexWrap: "wrap",
  },
  overrideLabel: {
    color: "var(--color-text-muted)",
    fontSize: "0.85rem",
    marginRight: 4,
  },
  overrideBtn: {
    padding: "4px 10px",
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: 6,
    fontSize: "0.85rem",
    color: "var(--color-text-secondary)",
  },
};