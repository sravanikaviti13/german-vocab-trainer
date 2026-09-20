import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { addWordToChapter, addWordsToChapterBulk } from "../api";

const POS_OPTIONS = ["noun", "verb", "adjective", "adverb"];
const ARTICLES = ["der", "die", "das"];

export default function AddWords() {
  const { chapterId } = useParams();
  const [mode, setMode] = useState("form"); // "form" | "bulk"

  return (
    <div style={styles.container}>
      <Link to={`/chapters/${chapterId}`} style={styles.backLink}>← Back to topic</Link>
      <h2 style={styles.title}>Add words</h2>

      <div style={styles.modeRow}>
        <button
          onClick={() => setMode("form")}
          style={{ ...styles.modeBtn, ...(mode === "form" ? styles.modeBtnActive : {}) }}
        >
          One at a time
        </button>
        <button
          onClick={() => setMode("bulk")}
          style={{ ...styles.modeBtn, ...(mode === "bulk" ? styles.modeBtnActive : {}) }}
        >
          Paste many
        </button>
      </div>

      {mode === "form" ? <FormMode chapterId={chapterId} /> : <BulkMode chapterId={chapterId} />}
    </div>
  );
}

function FormMode({ chapterId }) {
  const [pos, setPos] = useState("verb");
  const [lemma, setLemma] = useState("");
  const [article, setArticle] = useState("der");
  const [plural, setPlural] = useState("");
  const [english, setEnglish] = useState("");
  const [exampleDe, setExampleDe] = useState("");
  const [exampleEn, setExampleEn] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [added, setAdded] = useState([]); // words added this session

  async function handleSubmit(e) {
    e.preventDefault();
    if (!lemma.trim() || !english.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const word = await addWordToChapter(chapterId, {
        lemma: lemma.trim(),
        pos,
        article: pos === "noun" ? article : null,
        plural: pos === "noun" && plural.trim() ? plural.trim() : null,
        english: english.trim(),
        example_de: exampleDe.trim() || null,
        example_en: exampleEn.trim() || null,
      });
      setAdded((a) => [word, ...a]);
      setLemma("");
      setPlural("");
      setEnglish("");
      setExampleDe("");
      setExampleEn("");
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't add that word.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="card" style={styles.form}>
        <div style={styles.row}>
          <label style={styles.label}>
            Type
            <select value={pos} onChange={(e) => setPos(e.target.value)} style={styles.input}>
              {POS_OPTIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          {pos === "noun" && (
            <label style={styles.label}>
              Article
              <select value={article} onChange={(e) => setArticle(e.target.value)} style={styles.input}>
                {ARTICLES.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        <label style={styles.label}>
          German word
          <input value={lemma} onChange={(e) => setLemma(e.target.value)} style={styles.input} placeholder="helfen" />
        </label>

        {pos === "noun" && (
          <label style={styles.label}>
            Plural (optional)
            <input value={plural} onChange={(e) => setPlural(e.target.value)} style={styles.input} placeholder="Kinder" />
          </label>
        )}

        <label style={styles.label}>
          English meaning
          <input value={english} onChange={(e) => setEnglish(e.target.value)} style={styles.input} placeholder="to help" />
        </label>

        <div style={styles.row}>
          <label style={styles.label}>
            Example (German, optional)
            <input value={exampleDe} onChange={(e) => setExampleDe(e.target.value)} style={styles.input} />
          </label>
          <label style={styles.label}>
            Example (English, optional)
            <input value={exampleEn} onChange={(e) => setExampleEn(e.target.value)} style={styles.input} />
          </label>
        </div>

        <button type="submit" className="btn btn-primary" disabled={saving || !lemma.trim() || !english.trim()}>
          {saving ? "Adding..." : "Add word"}
        </button>
      </form>
      {error && <p style={styles.error}>{error}</p>}

      {added.length > 0 && (
        <div style={styles.addedList}>
          <p style={styles.addedTitle}>Added this session ({added.length})</p>
          {added.map((w) => (
            <div key={w.id} style={styles.addedItem}>
              {w.article ? `${w.article} ${w.lemma}` : w.lemma} — {w.english}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BulkMode({ chapterId }) {
  const [pos, setPos] = useState("verb");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { saved, skipped }

  function parseLines(raw, posValue) {
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    const items = [];
    let skipped = 0;
    for (const line of lines) {
      const parts = line.split(" - ");
      if (parts.length < 2) {
        skipped++;
        continue;
      }
      const left = parts[0].trim();
      const right = parts.slice(1).join(" - ").trim();
      if (!left || !right) {
        skipped++;
        continue;
      }
      let article = null;
      let lemma = left;
      if (posValue === "noun") {
        const m = left.match(/^(der|die|das)\s+(.+)$/i);
        if (m) {
          article = m[1].toLowerCase();
          lemma = m[2];
        }
      }
      items.push({ lemma, pos: posValue, article, english: right });
    }
    return { items, skipped };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim() || saving) return;
    const { items, skipped } = parseLines(text, pos);
    if (items.length === 0) {
      setError("Couldn't parse any lines — use one \"word - meaning\" per line.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await addWordsToChapterBulk(chapterId, items);
      setResult({ saved: res.saved, duplicates: res.duplicates, skipped, words: res.words });
      setText("");
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't add those words.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="card" style={styles.form}>
        <label style={styles.label}>
          Type (applies to every line)
          <select value={pos} onChange={(e) => setPos(e.target.value)} style={styles.input}>
            {POS_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>

        <p style={styles.hint}>
          One per line: <code>word - meaning</code>
          {pos === "noun" && <> — for nouns, prefix the article: <code>das Kind - child</code></>}
        </p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={pos === "noun" ? "das Kind - child\nder Mann - man" : "helfen - to help\ndanken - to thank"}
          style={styles.textarea}
          rows={8}
        />

        <button
          onClick={handleSubmit}
          className="btn btn-primary"
          disabled={saving || !text.trim()}
        >
          {saving ? "Adding..." : "Add words"}
        </button>
      </div>
      {error && <p style={styles.error}>{error}</p>}

      {result && (
        <div style={styles.addedList}>
          <p style={styles.addedTitle}>
            Added {result.saved} word{result.saved === 1 ? "" : "s"}
            {result.skipped > 0 && ` · ${result.skipped} skipped (couldn't parse)`}
            {result.duplicates > 0 && ` · ${result.duplicates} skipped (already in this topic)`}
          </p>
          {result.words.map((w) => (
            <div key={w.id} style={styles.addedItem}>
              {w.article ? `${w.article} ${w.lemma}` : w.lemma} — {w.english}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { maxWidth: 560, margin: "0 auto" },
  backLink: { color: "var(--color-link)", fontSize: "0.9rem" },
  title: { margin: "8px 0 16px" },

  modeRow: { display: "flex", gap: 8, marginBottom: 16 },
  modeBtn: {
    padding: "6px 16px",
    borderRadius: 20,
    border: "1px solid var(--color-border)",
    background: "var(--color-surface)",
    color: "var(--color-text-secondary)",
    fontSize: "0.9rem",
  },
  modeBtnActive: {
    background: "var(--color-accent)",
    borderColor: "var(--color-accent)",
    color: "var(--color-accent-contrast)",
  },

  form: { display: "flex", flexDirection: "column", gap: 14, padding: 20 },
  row: { display: "flex", gap: 12 },
  label: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: "0.85rem",
    color: "var(--color-text-secondary)",
  },
  input: {
    padding: "8px 10px",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-sm)",
    background: "var(--color-surface)",
    color: "var(--color-text)",
    fontSize: "1rem",
  },
  textarea: {
    padding: "10px 12px",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-sm)",
    background: "var(--color-surface)",
    color: "var(--color-text)",
    fontFamily: "inherit",
    fontSize: "0.95rem",
    resize: "vertical",
  },
  hint: { color: "var(--color-text-muted)", fontSize: "0.85rem" },
  error: { color: "#c33", marginTop: 12, fontSize: "0.9rem" },

  addedList: { marginTop: 20 },
  addedTitle: { color: "var(--color-text-secondary)", fontSize: "0.9rem", marginBottom: 8 },
  addedItem: {
    padding: "8px 12px",
    background: "var(--color-surface-alt)",
    borderRadius: "var(--radius-sm)",
    marginBottom: 6,
    fontSize: "0.95rem",
  },
};
