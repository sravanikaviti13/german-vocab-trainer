import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getChapterSummary, getChapterWordsFiltered } from "../api";

const POS_LABELS = {
  noun: { label: "Nouns", emoji: "📦", color: "#1976d2" },
  verb: { label: "Verbs", emoji: "🏃", color: "#d32f2f" },
  adjective: { label: "Adjectives", emoji: "🎨", color: "#7b1fa2" },
  adverb: { label: "Adverbs", emoji: "⚡", color: "#f57c00" },
};

export default function ChapterDetail() {
  const { chapterId } = useParams();
  const [summary, setSummary] = useState(null);
  const [expanded, setExpanded] = useState(null); // which POS is expanded
  const [wordsCache, setWordsCache] = useState({}); // { pos: [words] }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getChapterSummary(chapterId)
      .then(setSummary)
      .finally(() => setLoading(false));
  }, [chapterId]);

  async function toggleSection(pos) {
    if (expanded === pos) {
      setExpanded(null);
      return;
    }
    setExpanded(pos);
    if (!wordsCache[pos]) {
      const words = await getChapterWordsFiltered(chapterId, pos);
      setWordsCache({ ...wordsCache, [pos]: words });
    }
  }

  if (loading) return <p>Loading...</p>;
  if (!summary) return <p>Chapter not found.</p>;

  return (
    <div>
      <Link to="/" style={styles.backLink}>
        ← Library
      </Link>
      <div style={styles.header}>
        <p style={styles.bookTitle}>{summary.book_title}</p>
        <h2 style={styles.chapterTitle}>{summary.title}</h2>
        <p style={styles.meta}>
          {summary.total} words
          {summary.due_today > 0 && (
            <>
              {" · "}
              <span style={styles.due}>{summary.due_today} due today</span>
            </>
          )}
        </p>
      </div>

      <Link to={`/practice/${chapterId}`} style={styles.practiceAll}>
        Practice all {summary.total} words →
      </Link>

      <div style={styles.sections}>
        {Object.entries(summary.counts).map(([pos, count]) => {
          if (count === 0) return null;
          const meta = POS_LABELS[pos];
          const isOpen = expanded === pos;
          return (
            <div key={pos} style={styles.section}>
              <div style={styles.sectionHeader}>
                <button
                  onClick={() => toggleSection(pos)}
                  style={styles.sectionTitle}
                >
                  <span style={{ fontSize: "1.4rem" }}>{meta.emoji}</span>
                  <span style={{ color: meta.color, fontWeight: 600 }}>
                    {meta.label}
                  </span>
                  <span style={styles.count}>{count}</span>
                  <span style={styles.chevron}>{isOpen ? "▾" : "▸"}</span>
                </button>
                <Link
                  to={`/practice/${chapterId}?pos=${pos}`}
                  style={styles.practiceBtn}
                >
                  Practice
                </Link>
              </div>

              {isOpen && wordsCache[pos] && (
                <WordList words={wordsCache[pos]} pos={pos} />
              )}
              {isOpen && !wordsCache[pos] && <p style={styles.loading}>Loading…</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WordList({ words, pos }) {
  // Sort alphabetically by lemma
  const sorted = [...words].sort((a, b) => a.lemma.localeCompare(b.lemma, "de"));

  return (
    <ul style={styles.wordList}>
      {sorted.map((w) => (
        <li key={w.id} style={styles.wordItem}>
          <div style={styles.wordMain}>
            {w.article && <span style={styles.article}>{w.article}</span>}
            <span style={styles.wordLemma}>{w.lemma}</span>
            <span style={styles.wordEnglish}>— {w.english}</span>
          </div>
          <StrengthDots strength={w.strength} />
        </li>
      ))}
    </ul>
  );
}

function StrengthDots({ strength }) {
  return (
    <span style={styles.dots} title={`Strength: ${strength}/5`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          style={{
            ...styles.dot,
            background: i < strength ? "#4caf50" : "#e0e0e0",
          }}
        />
      ))}
    </span>
  );
}

const styles = {
  backLink: { color: "#0066cc", fontSize: "0.9rem" },
  header: { margin: "16px 0 24px" },
  bookTitle: { color: "#888", fontSize: "0.9rem" },
  chapterTitle: { fontSize: "2rem", fontWeight: 600, margin: "4px 0" },
  meta: { color: "#666", fontSize: "0.95rem" },
  due: { color: "#d32f2f", fontWeight: 500 },

  practiceAll: {
    display: "block",
    padding: "14px 20px",
    background: "#0066cc",
    color: "white",
    borderRadius: 8,
    textAlign: "center",
    fontWeight: 500,
    marginBottom: 16,
  },

  sections: { display: "flex", flexDirection: "column", gap: 12 },
  section: {
    background: "white",
    borderRadius: 8,
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    overflow: "hidden",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    padding: "12px 16px",
    gap: 12,
  },
  sectionTitle: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "none",
    border: "none",
    padding: 0,
    fontSize: "1rem",
    textAlign: "left",
  },
  count: {
    background: "#f0f0f0",
    color: "#555",
    padding: "2px 10px",
    borderRadius: 12,
    fontSize: "0.85rem",
    fontWeight: 500,
  },
  chevron: { color: "#999", marginLeft: "auto", fontSize: "0.9rem" },
  practiceBtn: {
    padding: "6px 14px",
    background: "#f0f0f0",
    color: "#333",
    borderRadius: 6,
    fontSize: "0.9rem",
  },

  wordList: {
    listStyle: "none",
    borderTop: "1px solid #eee",
    margin: 0,
    padding: 0,
  },
  wordItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 16px",
    borderBottom: "1px solid #f5f5f5",
  },
  wordMain: { display: "flex", alignItems: "baseline", gap: 6, flex: 1 },
  article: { color: "#0066cc", fontSize: "0.9rem" },
  wordLemma: { fontWeight: 500 },
  wordEnglish: { color: "#666", fontSize: "0.95rem" },

  dots: { display: "flex", gap: 3 },
  dot: { width: 6, height: 6, borderRadius: "50%", display: "inline-block" },

  loading: { padding: 16, color: "#888" },
};