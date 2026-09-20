import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { getChapterWordsFiltered, checkSentence, getSentencePrompts } from "../api";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

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
  const [level, setLevel] = useState(null);
  const [prompts, setPrompts] = useState([]);
  const [loadingPrompts, setLoadingPrompts] = useState(false);
  const inputRef = useRef();

  useEffect(() => {
    getChapterWordsFiltered(chapterId, posFilter)
      .then((ws) => setWords([...ws].sort(() => Math.random() - 0.5)))
      .finally(() => setLoading(false));
  }, [chapterId, posFilter]);

  // New word: drop any prompts shown for the previous word
  useEffect(() => {
    setLevel(null);
    setPrompts([]);
  }, [index]);

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

  async function handleLevelChange(e) {
    const lvl = e.target.value;
    if (!lvl) {
      setLevel(null);
      setPrompts([]);
      return;
    }
    setLevel(lvl);
    setLoadingPrompts(true);
    try {
      const r = await getSentencePrompts(word.id, lvl);
      setPrompts(r.prompts);
    } catch (err) {
      setPrompts([]);
    } finally {
      setLoadingPrompts(false);
    }
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

        <div style={styles.levelRow}>
          <span style={styles.levelLabel}>Want a prompt to translate?</span>
          <select value={level || ""} onChange={handleLevelChange} style={styles.levelSelect}>
            <option value="">— choose level —</option>
            {LEVELS.map((lvl) => (
              <option key={lvl} value={lvl}>{lvl}</option>
            ))}
          </select>
        </div>

        {level && (
          <div style={styles.promptsBox}>
            {loadingPrompts && <p style={styles.hint}>Loading {level} sentences...</p>}
            {!loadingPrompts && prompts.length === 0 && (
              <p style={styles.hint}>Couldn't load prompts, try again.</p>
            )}
            {!loadingPrompts && prompts.length > 0 && (
              <ul style={styles.promptsList}>
                {prompts.map((p, i) => (
                  <li key={i} style={styles.promptItem}>{p}</li>
                ))}
              </ul>
            )}
          </div>
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
              : "var(--color-border)",
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
                background: result.correct ? "rgba(46, 125, 50, 0.15)" : "rgba(204, 51, 51, 0.15)",
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
                {result.meaning_en && (
                <p style={styles.meaning}>
                    <span style={styles.correctedLabel}>Meaning: </span>
                    {result.meaning_en}
                </p>
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
    marginBottom: 16, color: "var(--color-text-secondary)", fontSize: "0.9rem",
  },
  backLink: { color: "var(--color-link)" },
  progress: {},
  live: { fontSize: "0.95rem", fontWeight: 500 },

  card: {
    background: "var(--color-surface)",
    borderRadius: 12,
    padding: 28,
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  },
  prompt: { color: "var(--color-text-muted)", fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: 1 },
  word: { fontSize: "2.4rem", fontWeight: 500, margin: "8px 0 4px" },
  article: { color: "var(--color-link)" },
  english: { color: "var(--color-text-secondary)", fontSize: "1.05rem" },
  hint: { color: "var(--color-text-muted)", fontSize: "0.9rem", margin: "12px 0 20px" },

  levelRow: {
    display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
  },
  levelLabel: { color: "var(--color-text-muted)", fontSize: "0.85rem" },
  levelSelect: {
    padding: "4px 10px",
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-sm)",
    color: "var(--color-text)",
    fontSize: "0.9rem",
  },
  promptsBox: {
    background: "var(--color-surface-alt)",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    padding: "10px 14px",
    marginBottom: 16,
  },
  promptsList: { margin: 0, paddingLeft: 18 },
  promptItem: { color: "var(--color-text)", fontSize: "0.95rem", margin: "4px 0" },

  textarea: {
    width: "100%",
    minHeight: 80,
    padding: 12,
    border: "2px solid var(--color-border)",
    borderRadius: 8,
    fontSize: "1.05rem",
    fontFamily: "inherit",
    resize: "vertical",
    boxSizing: "border-box",
    transition: "border-color 0.15s",
    background: "var(--color-surface)",
    color: "var(--color-text)",
  },
  buttons: {
    display: "flex", justifyContent: "space-between", gap: 12, marginTop: 12,
  },
  skipBtn: {
    padding: "10px 16px",
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    color: "var(--color-text-secondary)",
    fontSize: "0.95rem",
  },
  submitBtn: {
    padding: "10px 24px",
    background: "var(--color-accent)",
    color: "var(--color-accent-contrast)",
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
  corrected: { margin: "6px 0", color: "var(--color-text)" },
  correctedLabel: { color: "var(--color-text-muted)", fontSize: "0.9rem" },
  feedbackText: { color: "var(--color-text-secondary)", fontSize: "0.95rem", marginTop: 8 },
  meaning: { color: "var(--color-text-secondary)", fontSize: "0.9rem", marginTop: 6, fontStyle: "italic" },
  nextBtn: {
    padding: "8px 20px",
    background: "var(--color-accent)",
    color: "var(--color-accent-contrast)",
    border: "none",
    borderRadius: 6,
  },

  hintKey: { textAlign: "center", color: "var(--color-text-faint)", fontSize: "0.8rem", marginTop: 12 },

  done: {
    textAlign: "center", padding: 40, background: "var(--color-surface)",
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
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: 6,
    color: "var(--color-text-secondary)",
    fontSize: "0.95rem",
  },
};