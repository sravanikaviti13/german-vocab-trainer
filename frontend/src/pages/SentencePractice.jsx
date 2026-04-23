import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { getChapterWordsFiltered, checkSentence } from "../api";

export default function SentencePractice() {
  const { chapterId } = useParams();
  const [searchParams] = useSearchParams();
  const posFilter = searchParams.get("pos");

  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [text, setText] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState({ correct: 0, wrong: 0 });
  const inputRef = useRef();

  useEffect(() => {
    getChapterWordsFiltered(chapterId, posFilter)
      .then((ws) => setWords([...ws].sort(() => Math.random() - 0.5)))
      .finally(() => setLoading(false));
  }, [chapterId, posFilter]);

  if (loading) return <p>Loading...</p>;
  if (words.length === 0) return <p>No words to practice.</p>;

  if (index >= words.length) {
    return (
      <div style={styles.done}>
        <h2>Session complete</h2>
        <p style={styles.stat}>
          <span style={{ color: "#2e7d32" }}>✓ {stats.correct}</span>
          {"  "}·{"  "}
          <span style={{ color: "#c33" }}>✗ {stats.wrong}</span>
        </p>
        <Link to={`/chapters/${chapterId}`} style={styles.backLink}>
          ← Back to chapter
        </Link>
      </div>
    );
  }

  const word = words[index];

  async function submit() {
    if (text.trim().length < 3 || checking) return;
    setChecking(true);
    try {
      const r = await checkSentence(word.id, text);
      setResult(r);
      setStats((s) => ({
        correct: s.correct + (r.correct ? 1 : 0),
        wrong: s.wrong + (r.correct ? 0 : 1),
      }));
    } catch (err) {
      setResult({
        correct: false,
        corrected: text,
        feedback: "Couldn't check right now. Please try again.",
      });
    } finally {
      setChecking(false);
    }
  }

  function next() {
    setText("");
    setResult(null);
    setIndex(index + 1);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function tryAgain() {
    setResult(null);
    setText("");  // clear the input so user starts fresh
    setTimeout(() => inputRef.current?.focus(), 50);
    // Note: we don't change index — same word stays
    // Note: stats already counted this attempt — that's correct, it WAS a real attempt
  }

  function skip() {
    setText("");
    setResult(null);
    setIndex(index + 1);
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <Link to={`/chapters/${chapterId}`} style={styles.backLink}>← Exit</Link>
        <span style={styles.progress}>{index + 1} / {words.length}</span>
        <span style={styles.live}>
          <span style={{ color: "#2e7d32" }}>✓ {stats.correct}</span>
          {"  "}
          <span style={{ color: "#c33" }}>✗ {stats.wrong}</span>
        </span>
      </div>

      <div style={styles.card}>
        <p style={styles.prompt}>Write a sentence using</p>
        <h1 style={styles.word}>
          {word.article && <span style={styles.article}>{word.article} </span>}
          {word.lemma}
        </h1>
        <p style={styles.english}>{word.english}</p>
        {word.example_de && (
          <p style={styles.hint}>
            💡 example: <em>{word.example_de}</em>
          </p>
        )}

        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
          }}
          disabled={!!result}
          placeholder="Type your German sentence here..."
          style={{
            ...styles.textarea,
            borderColor: result
              ? result.correct ? "#4caf50" : "#c33"
              : "#ccc",
          }}
          autoFocus
        />

        {!result && (
          <div style={styles.buttons}>
            <button onClick={skip} style={styles.skipBtn}>Skip</button>
            <button
              onClick={submit}
              disabled={checking || text.trim().length < 3}
              style={{
                ...styles.submitBtn,
                opacity: (checking || text.trim().length < 3) ? 0.5 : 1,
              }}
            >
              {checking ? "Checking..." : "Check"}
            </button>
          </div>
        )}

        {result && (
            <div style={{
                ...styles.feedback,
                background: result.correct ? "#e8f5e9" : "#fee",
                borderLeftColor: result.correct ? "#2e7d32" : "#c33",
            }}>
                <p style={styles.feedbackTitle}>
                {result.correct ? "✓ Nice!" : "✗ Needs work"}
                </p>
                {!result.correct && result.corrected && result.corrected !== text && (
                <p style={styles.corrected}>
                    <span style={styles.correctedLabel}>Corrected: </span>
                    {result.corrected}
                </p>
                )}
                {result.feedback && (
                <p style={styles.feedbackText}>{result.feedback}</p>
                )}
                <div style={styles.feedbackButtons}>
                <button onClick={tryAgain} style={styles.tryAgainBtn}>
                    {result.correct ? "Another for this word" : "Try again"}
                </button>
                <button onClick={next} style={styles.nextBtn}>Next word →</button>
                </div>
            </div>
        )}
      </div>

      <p style={styles.hintKey}>Tip: Ctrl+Enter to submit</p>
    </div>
  );
}

const styles = {
  container: { maxWidth: 640, margin: "0 auto" },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    marginBottom: 16, color: "#666", fontSize: "0.9rem",
  },
  backLink: { color: "#0066cc" },
  progress: {},
  live: { fontSize: "0.95rem", fontWeight: 500 },

  card: {
    background: "white",
    borderRadius: 12,
    padding: 28,
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  },
  prompt: { color: "#888", fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: 1 },
  word: { fontSize: "2.4rem", fontWeight: 500, margin: "8px 0 4px" },
  article: { color: "#0066cc" },
  english: { color: "#444", fontSize: "1.05rem" },
  hint: { color: "#888", fontSize: "0.9rem", margin: "12px 0 20px" },

  textarea: {
    width: "100%",
    minHeight: 80,
    padding: 12,
    border: "2px solid #ccc",
    borderRadius: 8,
    fontSize: "1.05rem",
    fontFamily: "inherit",
    resize: "vertical",
    boxSizing: "border-box",
    transition: "border-color 0.15s",
  },
  buttons: {
    display: "flex", justifyContent: "space-between", gap: 12, marginTop: 12,
  },
  skipBtn: {
    padding: "10px 16px",
    background: "white",
    border: "1px solid #ddd",
    borderRadius: 8,
    color: "#555",
    fontSize: "0.95rem",
  },
  submitBtn: {
    padding: "10px 24px",
    background: "#0066cc",
    color: "white",
    border: "none",
    borderRadius: 8,
    fontSize: "1rem",
  },

  feedback: {
    marginTop: 16,
    padding: 14,
    borderLeft: "4px solid",
    borderRadius: 6,
  },
  feedbackTitle: { fontWeight: 600, marginBottom: 6 },
  corrected: { margin: "6px 0", color: "#222" },
  correctedLabel: { color: "#888", fontSize: "0.9rem" },
  feedbackText: { color: "#555", fontSize: "0.95rem", marginTop: 8 },
  nextBtn: {
    padding: "8px 20px",
    background: "#0066cc",
    color: "white",
    border: "none",
    borderRadius: 6,
  },

  hintKey: { textAlign: "center", color: "#aaa", fontSize: "0.8rem", marginTop: 12 },

  done: {
    textAlign: "center", padding: 40, background: "white",
    borderRadius: 12, maxWidth: 400, margin: "40px auto",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  },
  stat: { fontSize: "1.4rem", margin: "16px 0", fontWeight: 500 },

  feedbackButtons: {
    display: "flex",
    gap: 10,
    marginTop: 14,
  },
  tryAgainBtn: {
    padding: "8px 16px",
    background: "white",
    border: "1px solid #ccc",
    borderRadius: 6,
    color: "#555",
    fontSize: "0.95rem",
  },
};