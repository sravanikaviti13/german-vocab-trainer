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

      <div style={styles.topActions}>
        <Link to={`/match/${chapterId}`} style={{ ...styles.practiceAll, background: "#2e7d32" }}>
            Match all →
        </Link>
        <Link to={`/practice/${chapterId}`} style={styles.practiceAll}>
            Practice all →
        </Link>
      </div>

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
                <div style={{ display: "flex", gap: 6 }}>
                    {pos === "noun" && (
                        <MasteryButton
                        to={`/drill/${chapterId}/articles`}
                        label="Articles"
                        percent={summary.mastery?.noun}
                        />
                    )}
                    <Link
                        to={`/match/${chapterId}?pos=${pos}`}
                        style={{ ...styles.practiceBtn, background: "#e8f5e9", color: "#2e7d32" }}
                    >
                        Match
                    </Link>
                    <Link
                        to={`/practice/${chapterId}?pos=${pos}`}
                        style={styles.practiceBtn}
                    >
                        Practice
                    </Link>
                </div>
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

function MasteryButton({ to, label, percent }) {
  const hasData = percent !== null && percent !== undefined;
  // Color gradient: red (low) → yellow (mid) → green (high)
  const fillColor =
    !hasData ? "#e0e0e0" :
    percent >= 80 ? "#4caf50" :
    percent >= 50 ? "#fdd835" :
    "#ef9a9a";

  return (
    <Link to={to} style={styles.masteryBtn} title={hasData ? `${percent}% mastery` : "Not practiced yet"}>
      <span
        style={{
          ...styles.masteryFill,
          width: hasData ? `${percent}%` : "0%",
          background: fillColor,
        }}
      />
      <span style={styles.masteryLabel}>
        {label}
        {hasData && <span style={styles.masteryPct}> {percent}%</span>}
      </span>
    </Link>
  );
}

function WordList({ words, pos }) {
  const sorted = [...words].sort((a, b) => a.lemma.localeCompare(b.lemma, "de"));

  return (
    <ul style={styles.wordList}>
      {sorted.map((w) => (
        <WordRow key={w.id} word={w} />
      ))}
    </ul>
  );
}

function WordRow({ word }) {
  const [hovered, setHovered] = useState(false);

  return (
    <li
      style={styles.wordItem}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => setHovered((h) => !h)} // tap-to-reveal on mobile
    >
      <div style={styles.wordMain}>
        {word.article && <span style={styles.article}>{word.article}</span>}
        <span style={styles.wordLemma}>{word.lemma}</span>
        <span style={{
          ...styles.wordEnglish,
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.15s",
        }}>
          — {word.english}
        </span>
      </div>
      <StrengthDots strength={word.strength} />
    </li>
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
    cursor: "pointer",
  },
  wordMain: { display: "flex", alignItems: "baseline", gap: 6, flex: 1 },
  article: { color: "#0066cc", fontSize: "0.9rem" },
  wordLemma: { fontWeight: 500 },
  wordEnglish: { color: "#666", fontSize: "0.95rem" },

  dots: { display: "flex", gap: 3 },
  dot: { width: 6, height: 6, borderRadius: "50%", display: "inline-block" },

  loading: { padding: 16, color: "#888" },

  masteryBtn: {
    position: "relative",
    display: "inline-block",
    padding: "6px 14px",
    background: "#fff3e0",
    color: "#e65100",
    borderRadius: 6,
    fontSize: "0.9rem",
    overflow: "hidden",
    minWidth: 90,
    textAlign: "center",
  },
  masteryFill: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    transition: "width 0.4s ease",
    opacity: 0.35,
    zIndex: 0,
  },
  masteryLabel: {
    position: "relative",
    zIndex: 1,
  },
  masteryPct: {
    marginLeft: 4,
    fontWeight: 600,
  },
  topActions: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    marginBottom: 16,
  },
};