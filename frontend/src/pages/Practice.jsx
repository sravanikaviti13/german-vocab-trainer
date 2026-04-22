import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getChapterWords, recordReview } from "../api";

export default function Practice() {
  const { chapterId } = useParams();
  const [words, setWords] = useState([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ correct: 0, wrong: 0 });

  useEffect(() => {
    getChapterWords(chapterId)
      .then((data) => {
        // Shuffle for variety
        setWords([...data].sort(() => Math.random() - 0.5));
      })
      .finally(() => setLoading(false));
  }, [chapterId]);

  if (loading) return <p>Loading...</p>;
  if (words.length === 0) return <p>No words in this chapter.</p>;

  if (index >= words.length) {
    return (
      <div style={styles.done}>
        <h2>Session complete!</h2>
        <p>✓ Correct: {stats.correct}</p>
        <p>✗ Missed: {stats.wrong}</p>
        <Link to="/">← Back to library</Link>
      </div>
    );
  }

  const word = words[index];

  async function answer(correct) {
    await recordReview(word.id, correct);
    setStats((s) => ({
      correct: s.correct + (correct ? 1 : 0),
      wrong: s.wrong + (correct ? 0 : 1),
    }));
    setRevealed(false);
    setIndex((i) => i + 1);
  }

  return (
    <div style={styles.container}>
      <p style={styles.progress}>
        {index + 1} / {words.length}
      </p>
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
          </div>
        ) : (
          <button onClick={() => setRevealed(true)} style={styles.reveal}>
            Reveal
          </button>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: { maxWidth: 600, margin: "0 auto" },
  progress: { color: "#888", marginBottom: 12 },
  card: {
    background: "white",
    borderRadius: 12,
    padding: 32,
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
    textAlign: "center",
  },
  front: { padding: "24px 0" },
  article: { color: "#0066cc", fontSize: "1.2rem", marginRight: 8 },
  lemma: { fontSize: "2.5rem", fontWeight: 500, marginBottom: 8 },
  pos: { color: "#888", fontSize: "0.9rem", textTransform: "uppercase" },
  reveal: {
    padding: "12px 24px",
    background: "#f0f0f0",
    border: "none",
    borderRadius: 8,
    fontSize: "1rem",
    marginTop: 12,
  },
  hr: { border: "none", borderTop: "1px solid #eee", margin: "20px 0" },
  back: {},
  english: { fontSize: "1.4rem", marginBottom: 8 },
  plural: { color: "#666", fontSize: "0.95rem" },
  example: { background: "#fafafa", padding: 12, borderRadius: 8, margin: "16px 0" },
  exampleEn: { color: "#888", fontSize: "0.9rem", marginTop: 4, fontStyle: "italic" },
  buttons: { display: "flex", gap: 12, justifyContent: "center", marginTop: 20 },
  wrong: {
    padding: "10px 20px", background: "#fee", color: "#c33",
    border: "none", borderRadius: 8, fontSize: "1rem",
  },
  correct: {
    padding: "10px 20px", background: "#e8f5e9", color: "#2e7d32",
    border: "none", borderRadius: 8, fontSize: "1rem",
  },
  done: { textAlign: "center", padding: 40 },
};