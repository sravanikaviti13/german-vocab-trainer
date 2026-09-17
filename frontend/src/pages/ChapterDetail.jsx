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
                <div style={styles.sectionActions}>
                    {pos === "noun" && (
                        <MasteryButton
                            to={`/drill/${chapterId}/articles`}
                            label="Articles"
                            percent={summary.mastery?.noun}
                            sessionSize={summary.last_session_size}
                        />
                    )}
                    <Link
                        to={`/match/${chapterId}?pos=${pos}`}
                        style={{ ...styles.practiceBtn, background: "rgba(46, 125, 50, 0.15)", color: "#2e7d32" }}
                    >
                        Match
                    </Link>
                    <Link
                      to={`/sentences/${chapterId}?pos=${pos}`}
                      style={{ ...styles.practiceBtn, background: "rgba(106, 27, 154, 0.15)", color: "#6a1b9a" }}
                    >
                      Sentences
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

function MasteryButton({ to, label, percent, sessionSize }) {
  const hasData = percent !== null && percent !== undefined;
  const fillColor =
    !hasData ? "var(--color-border)" :
    percent >= 80 ? "#4caf50" :
    percent >= 50 ? "#fdd835" :
    "#ef9a9a";

  const tooltip = hasData
    ? `Last session: ${percent}% (${sessionSize} attempts)`
    : "Not drilled yet";

  return (
    <Link to={to} style={styles.masteryBtn} title={tooltip}>
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
            background: i < strength ? "#4caf50" : "var(--color-border)",
          }}
        />
      ))}
    </span>
  );
}

const styles = {
  backLink: { color: "var(--color-link)", fontSize: "0.9rem" },
  header: { margin: "16px 0 24px" },
  bookTitle: { color: "var(--color-text-muted)", fontSize: "0.9rem" },
  chapterTitle: { fontSize: "2rem", fontWeight: 600, margin: "4px 0" },
  meta: { color: "var(--color-text-secondary)", fontSize: "0.95rem" },
  due: { color: "#d32f2f", fontWeight: 500 },

  practiceAll: {
    display: "block",
    padding: "14px 20px",
    background: "var(--color-accent)",
    color: "var(--color-accent-contrast)",
    borderRadius: 8,
    textAlign: "center",
    fontWeight: 500,
  },

  sections: { display: "flex", flexDirection: "column", gap: 12 },
  section: {
    background: "var(--color-surface)",
    borderRadius: 8,
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    overflow: "hidden",
  },
  sectionHeader: {
    display: "flex",
    flexWrap: "wrap",
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
    color: "var(--color-text)",
  },
  sectionActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginLeft: "auto",
  },
  count: {
    background: "var(--color-surface-alt)",
    color: "var(--color-text-secondary)",
    padding: "2px 10px",
    borderRadius: 12,
    fontSize: "0.85rem",
    fontWeight: 500,
  },
  chevron: { color: "var(--color-text-muted)", marginLeft: "auto", fontSize: "0.9rem" },
  practiceBtn: {
    padding: "6px 14px",
    background: "var(--color-surface-alt)",
    color: "var(--color-text)",
    borderRadius: 6,
    fontSize: "0.9rem",
  },

  wordList: {
    listStyle: "none",
    borderTop: "1px solid var(--color-border-soft)",
    margin: 0,
    padding: 0,
  },
  wordItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 16px",
    borderBottom: "1px solid var(--color-border-soft)",
    cursor: "pointer",
  },
  wordMain: { display: "flex", alignItems: "baseline", gap: 6, flex: 1 },
  article: { color: "var(--color-link)", fontSize: "0.9rem" },
  wordLemma: { fontWeight: 500 },
  wordEnglish: { color: "var(--color-text-secondary)", fontSize: "0.95rem" },

  dots: { display: "flex", gap: 3 },
  dot: { width: 6, height: 6, borderRadius: "50%", display: "inline-block" },

  loading: { padding: 16, color: "var(--color-text-muted)" },

  masteryBtn: {
    position: "relative",
    display: "inline-block",
    padding: "6px 14px",
    background: "rgba(230, 81, 0, 0.15)",
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