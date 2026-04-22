import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { getChapterWordsFiltered, recordReview, logArticleAttempt } from "../api";

const ARTICLES = ["der", "die", "das"];
const ARTICLE_COLORS = {
  der: "#1976d2",
  die: "#d32f2f",
  das: "#388e3c",
};

export default function ArticleDrill() {
  const { chapterId } = useParams();
  const [words, setWords] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [answered, setAnswered] = useState(null); // null | "correct" | "wrong"
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [stats, setStats] = useState({ correct: 0, wrong: 0, streak: 0, bestStreak: 0 });

  useEffect(() => {
    getChapterWordsFiltered(chapterId, "noun").then((nouns) => {
      // Only keep nouns with a known article — skip the "?" ones
      const withArticle = nouns.filter(
        (w) => w.article && ARTICLES.includes(w.article)
      );
      // Shuffle
      setWords([...withArticle].sort(() => Math.random() - 0.5));
      setLoading(false);
    });
  }, [chapterId]);

  if (loading) return <p>Loading...</p>;

  if (words.length === 0) {
    return (
      <div style={styles.empty}>
        <p>No nouns with articles found in this chapter.</p>
        <Link to={`/chapters/${chapterId}`} style={styles.backLink}>
          ← Back to chapter
        </Link>
      </div>
    );
  }

  // Session done
  if (index >= words.length) {
    const total = stats.correct + stats.wrong;
    const pct = total > 0 ? Math.round((stats.correct / total) * 100) : 0;
    return (
      <div style={styles.done}>
        <h2>Article drill complete</h2>
        <p style={styles.bigStat}>
          {stats.correct} / {total} correct ({pct}%)
        </p>
        <p style={styles.muted}>Longest streak: {stats.bestStreak}</p>
        <Link to={`/chapters/${chapterId}`} style={styles.backLink}>
          ← Back to chapter
        </Link>
      </div>
    );
  }

  const word = words[index];

  async function pick(article) {
    if (answered) return;

    const correct = article === word.article;
    setSelectedArticle(article);
    setAnswered(correct ? "correct" : "wrong");

    try {
        await recordReview(word.id, correct);
        await logArticleAttempt(word.id, parseInt(chapterId), correct);  // add this
    } catch (err) {
        console.error("Failed to record:", err);
    }

    const newStreak = correct ? stats.streak + 1 : 0;
    setStats({
        correct: stats.correct + (correct ? 1 : 0),
        wrong: stats.wrong + (correct ? 0 : 1),
        streak: newStreak,
        bestStreak: Math.max(stats.bestStreak, newStreak),
    });
}

  function next() {
    setAnswered(null);
    setSelectedArticle(null);
    setIndex(index + 1);
  }

  // Keyboard support: 1 = der, 2 = die, 3 = das, Enter = next
  function handleKey(e) {
    if (!answered) {
      if (e.key === "1") pick("der");
      if (e.key === "2") pick("die");
      if (e.key === "3") pick("das");
    } else {
      if (e.key === "Enter" || e.key === " ") next();
    }
  }

  return (
    <div
      style={styles.container}
      onKeyDown={handleKey}
      tabIndex={0}
      ref={(el) => el?.focus()}
    >
      <div style={styles.header}>
        <Link to={`/chapters/${chapterId}`} style={styles.backLink}>
          ← Exit
        </Link>
        <span style={styles.progress}>
          {index + 1} / {words.length}
        </span>
        <span style={styles.streak}>
          {stats.streak > 0 && `🔥 ${stats.streak}`}
        </span>
      </div>

      <div style={styles.card}>
        <p style={styles.prompt}>Which article?</p>
        <h1 style={styles.noun}>{word.lemma}</h1>
        <p style={styles.english}>{word.english}</p>

        <div style={styles.buttons}>
          {ARTICLES.map((art) => {
            let style = { ...styles.articleBtn, borderColor: ARTICLE_COLORS[art] };
            if (answered) {
              if (art === word.article) {
                // Always show the correct answer in green
                style = { ...style, ...styles.btnCorrect };
              } else if (art === selectedArticle) {
                // Show what user picked in red (if it was wrong)
                style = { ...style, ...styles.btnWrong };
              } else {
                // Dim the other option
                style = { ...style, opacity: 0.4 };
              }
            }
            return (
              <button
                key={art}
                onClick={() => pick(art)}
                style={style}
                disabled={!!answered}
              >
                {art}
              </button>
            );
          })}
        </div>

        {answered && (
          <div style={styles.feedback}>
            {answered === "correct" ? (
              <p style={styles.correctMsg}>✓ Correct!</p>
            ) : (
              <p style={styles.wrongMsg}>
                ✗ It's <strong>{word.article} {word.lemma}</strong>
              </p>
            )}
            {word.plural && (
              <p style={styles.plural}>plural: die {word.plural}</p>
            )}
            {word.example_de && (
              <p style={styles.example}>{word.example_de}</p>
            )}
            <button onClick={next} style={styles.nextBtn}>
              Next →
            </button>
          </div>
        )}
      </div>

      <p style={styles.keyboardHint}>
        Press 1/2/3 or click · Enter for next
      </p>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: 600,
    margin: "0 auto",
    outline: "none",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    color: "#666",
    fontSize: "0.9rem",
  },
  backLink: { color: "#0066cc" },
  progress: {},
  streak: { fontSize: "1rem" },

  card: {
    background: "white",
    borderRadius: 12,
    padding: "40px 24px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
    textAlign: "center",
    minHeight: 360,
  },
  prompt: { color: "#888", fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: 1 },
  noun: { fontSize: "3rem", fontWeight: 500, margin: "16px 0 8px" },
  english: { color: "#666", fontSize: "1.1rem", marginBottom: 28 },

  buttons: {
    display: "flex",
    gap: 12,
    justifyContent: "center",
    marginBottom: 16,
  },
  articleBtn: {
    flex: 1,
    maxWidth: 140,
    padding: "18px 0",
    fontSize: "1.6rem",
    fontWeight: 500,
    background: "white",
    border: "2px solid",
    borderRadius: 10,
    color: "#333",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  btnCorrect: {
    background: "#e8f5e9",
    borderColor: "#2e7d32",
    color: "#2e7d32",
  },
  btnWrong: {
    background: "#fee",
    borderColor: "#c33",
    color: "#c33",
  },

  feedback: { marginTop: 24 },
  correctMsg: { color: "#2e7d32", fontSize: "1.2rem", marginBottom: 8 },
  wrongMsg: { color: "#c33", fontSize: "1.1rem", marginBottom: 8 },
  plural: { color: "#666", fontSize: "0.95rem" },
  example: {
    background: "#fafafa",
    padding: 10,
    borderRadius: 6,
    margin: "12px 0",
    fontSize: "0.95rem",
    color: "#555",
  },
  nextBtn: {
    marginTop: 16,
    padding: "10px 24px",
    background: "#0066cc",
    color: "white",
    border: "none",
    borderRadius: 8,
    fontSize: "1rem",
  },

  keyboardHint: {
    textAlign: "center",
    color: "#aaa",
    fontSize: "0.85rem",
    marginTop: 16,
  },

  empty: { textAlign: "center", padding: 40 },
  done: {
    textAlign: "center",
    padding: 40,
    background: "white",
    borderRadius: 12,
    maxWidth: 400,
    margin: "40px auto",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  },
  bigStat: { fontSize: "1.5rem", margin: "16px 0", fontWeight: 500 },
  muted: { color: "#888" },
};