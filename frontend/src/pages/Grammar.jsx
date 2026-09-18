import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listGrammarTopics, createGrammarTopic } from "../api";

export default function Grammar() {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    refresh();
  }, []);

  function refresh() {
    setLoading(true);
    listGrammarTopics()
      .then(setTopics)
      .finally(() => setLoading(false));
  }

  async function handleCreate(e) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title || creating) return;
    setCreating(true);
    setError(null);
    try {
      await createGrammarTopic(title);
      setNewTitle("");
      refresh();
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't create topic.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <h2>Grammar</h2>
      <p style={styles.subtitle}>
        Topics you build yourself — e.g. "Dativ verbs" — with your own word lists
        and the same matching/practice/sentence exercises as your books.
      </p>

      <form onSubmit={handleCreate} className="card" style={styles.form}>
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New topic title, e.g. Dativ verbs"
          style={styles.input}
        />
        <button type="submit" className="btn btn-primary" disabled={creating || !newTitle.trim()}>
          {creating ? "Adding..." : "Add topic"}
        </button>
      </form>
      {error && <p style={styles.error}>{error}</p>}

      {loading && <p>Loading...</p>}

      {!loading && topics.length === 0 && (
        <p style={styles.subtitle}>No grammar topics yet — add one above.</p>
      )}

      {!loading && topics.length > 0 && (
        <div style={styles.list}>
          {topics.map((topic) => (
            <Link key={topic.id} to={`/chapters/${topic.id}`} className="card" style={styles.topic}>
              <span>{topic.title}</span>
              <span style={styles.count}>{topic.word_count} words</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  subtitle: { color: "var(--color-text-secondary)", margin: "8px 0 20px" },
  form: {
    display: "flex",
    gap: 10,
    padding: 16,
    marginBottom: 20,
  },
  input: {
    flex: 1,
    padding: "10px 12px",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-sm)",
    background: "var(--color-surface)",
    color: "var(--color-text)",
  },
  error: { color: "#c33", marginBottom: 16, fontSize: "0.9rem" },
  list: { display: "flex", flexDirection: "column", gap: 12 },
  topic: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    color: "var(--color-link)",
  },
  count: { color: "var(--color-text-muted)", fontSize: "0.9rem" },
};
