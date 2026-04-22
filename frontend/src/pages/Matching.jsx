import { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { getChapterWordsFiltered, recordReview } from "../api";

const ROUND_SIZE = 6;

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

export default function Matching() {
  const { chapterId } = useParams();
  const [searchParams] = useSearchParams();
  const posFilter = searchParams.get("pos");

  const [allWords, setAllWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sessionStarted, setSessionStarted] = useState(false);

  // Current round state
  const [roundWords, setRoundWords] = useState([]); // the 6 words for this round
  const [leftCol, setLeftCol] = useState([]);       // { word, matched } items, shuffled
  const [rightCol, setRightCol] = useState([]);     // { word, matched } items, separately shuffled
  const [selectedLeft, setSelectedLeft] = useState(null);   // word.id
  const [wrongFlash, setWrongFlash] = useState(null);        // { leftId, rightId }
  const [attemptsThisRound, setAttemptsThisRound] = useState({}); // wordId -> attempt count

  const [stats, setStats] = useState({ firstTry: 0, withHelp: 0, rounds: 0 });

  useEffect(() => {
    getChapterWordsFiltered(chapterId, posFilter)
      .then(setAllWords)
      .finally(() => setLoading(false));
  }, [chapterId, posFilter]);

  function startSession() {
    setSessionStarted(true);
    loadNextRound(allWords);
  }

  function loadNextRound(pool) {
    if (pool.length < 2) return;
    const roundSize = Math.min(ROUND_SIZE, pool.length);
    const chosen = shuffle(pool).slice(0, roundSize);
    setRoundWords(chosen);
    setLeftCol(shuffle(chosen).map((w) => ({ word: w, matched: false })));
    setRightCol(shuffle(chosen).map((w) => ({ word: w, matched: false })));
    setSelectedLeft(null);
    setAttemptsThisRound({});
  }

  async function handlePick(side, wordId) {
    if (side === "left") {
      setSelectedLeft(wordId);
      return;
    }

    // side === "right", we need a leftSelection
    if (selectedLeft === null) return;

    const leftId = selectedLeft;
    const rightId = wordId;

    // Count attempt (keyed on the LEFT word, since that's what we're trying to match)
    setAttemptsThisRound((prev) => ({
      ...prev,
      [leftId]: (prev[leftId] || 0) + 1,
    }));

    if (leftId === rightId) {
      // Correct!
      const attempts = (attemptsThisRound[leftId] || 0) + 1;
      const firstTry = attempts === 1;

      // Record review
      try {
        await recordReview(leftId, firstTry);
      } catch (err) {
        console.error(err);
      }

      setStats((s) => ({
        firstTry: s.firstTry + (firstTry ? 1 : 0),
        withHelp: s.withHelp + (firstTry ? 0 : 1),
        rounds: s.rounds,
      }));

      // Mark as matched
      setLeftCol((col) => col.map((i) => i.word.id === leftId ? { ...i, matched: true } : i));
      setRightCol((col) => col.map((i) => i.word.id === rightId ? { ...i, matched: true } : i));
      setSelectedLeft(null);

      // Check if round complete
      const remaining = leftCol.filter((i) => !i.matched && i.word.id !== leftId);
      if (remaining.length === 0) {
        // Round done, pause then load next
        setTimeout(() => {
          setStats((s) => ({ ...s, rounds: s.rounds + 1 }));
          loadNextRound(allWords);
        }, 600);
      }
    } else {
      // Wrong — flash red, then clear
      setWrongFlash({ leftId, rightId });
      setTimeout(() => {
        setWrongFlash(null);
        setSelectedLeft(null);
      }, 500);
    }
  }

  if (loading) return <p>Loading...</p>;
  if (allWords.length < 2) {
    return (
      <div style={styles.empty}>
        <p>Not enough words to play matching.</p>
        <Link to={`/chapters/${chapterId}`} style={styles.backLink}>← Back</Link>
      </div>
    );
  }

  // Setup screen
  if (!sessionStarted) {
    return (
      <div style={styles.setup}>
        <h2>Matching</h2>
        <p style={styles.muted}>
          Tap a German word, then tap its English meaning.
        </p>
        <p style={styles.muted}>
          {allWords.length} {posFilter ? `${posFilter}s` : "words"} in pool · {ROUND_SIZE} per round
        </p>
        <button onClick={startSession} style={styles.primaryButton}>
          Start
        </button>
        <Link to={`/chapters/${chapterId}`} style={styles.backLink}>← Cancel</Link>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <Link to={`/chapters/${chapterId}`} style={styles.backLink}>← Exit</Link>
        <span style={styles.progress}>
          Round {stats.rounds + 1}
        </span>
        <span style={styles.live}>
          <span style={{ color: "#2e7d32" }}>✓ {stats.firstTry}</span>
          {"  "}
          <span style={{ color: "#f57c00" }}>~ {stats.withHelp}</span>
        </span>
      </div>

      <div style={styles.grid}>
        <div style={styles.col}>
          <p style={styles.colHeader}>German</p>
          {leftCol.map(({ word, matched }) => (
            <Card
              key={word.id}
              label={word.article ? `${word.article} ${word.lemma}` : word.lemma}
              matched={matched}
              selected={selectedLeft === word.id}
              flashed={wrongFlash?.leftId === word.id}
              onClick={() => !matched && handlePick("left", word.id)}
            />
          ))}
        </div>
        <div style={styles.col}>
          <p style={styles.colHeader}>English</p>
          {rightCol.map(({ word, matched }) => (
            <Card
              key={word.id}
              label={word.english}
              matched={matched}
              selected={false}
              flashed={wrongFlash?.rightId === word.id}
              onClick={() => !matched && handlePick("right", word.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Card({ label, matched, selected, flashed, onClick }) {
  let style = { ...cardStyles.base };
  if (matched) style = { ...style, ...cardStyles.matched };
  else if (flashed) style = { ...style, ...cardStyles.flashed };
  else if (selected) style = { ...style, ...cardStyles.selected };

  return (
    <button onClick={onClick} style={style} disabled={matched}>
      {label}
    </button>
  );
}

const cardStyles = {
  base: {
    display: "block",
    width: "100%",
    padding: "14px 12px",
    margin: "6px 0",
    background: "white",
    border: "2px solid #e0e0e0",
    borderRadius: 8,
    fontSize: "1rem",
    textAlign: "left",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  selected: {
    borderColor: "#0066cc",
    background: "#e3f2fd",
    boxShadow: "0 0 0 2px rgba(0,102,204,0.15)",
  },
  matched: {
    opacity: 0.35,
    borderColor: "#4caf50",
    background: "#e8f5e9",
    cursor: "default",
  },
  flashed: {
    borderColor: "#c33",
    background: "#fee",
    animation: "shake 0.3s",
  },
};

const styles = {
  container: { maxWidth: 700, margin: "0 auto" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    color: "#666",
    fontSize: "0.9rem",
  },
  backLink: { color: "#0066cc" },
  progress: {},
  live: { fontSize: "0.95rem", fontWeight: 500 },

  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  },
  col: {},
  colHeader: {
    color: "#888",
    fontSize: "0.85rem",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },

  setup: {
    maxWidth: 500,
    margin: "40px auto",
    background: "white",
    padding: 32,
    borderRadius: 12,
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  },
  primaryButton: {
    display: "block",
    padding: "12px 24px",
    background: "#0066cc",
    color: "white",
    border: "none",
    borderRadius: 8,
    fontSize: "1rem",
    width: "100%",
    marginTop: 16,
  },
  muted: { color: "#666", marginBottom: 8 },

  empty: { textAlign: "center", padding: 40 },
};