import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listBooks } from "../api";

export default function Library() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listBooks()
      .then(setBooks)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading...</p>;

  if (books.length === 0) {
    return (
      <div>
        <h2>No books yet</h2>
        <p>Upload a PDF to get started.</p>
        <Link to="/upload">Go to upload →</Link>
      </div>
    );
  }

  return (
    <div>
      <h2>Your Library</h2>
      {books.map((book) => (
        <div key={book.id} style={styles.book}>
          <h3>{book.title}</h3>
          {book.chapters.map((ch) => (
            <Link
              key={ch.id}
              to={`/chapters/${ch.id}`}
              style={styles.chapter}
            >
              <span>{ch.title}</span>
              <span style={styles.count}>{ch.word_count} words</span>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}

const styles = {
  book: {
    background: "var(--color-surface)",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  },
  chapter: {
    display: "flex",
    justifyContent: "space-between",
    padding: "12px 0",
    borderBottom: "1px solid var(--color-border-soft)",
    color: "var(--color-link)",
  },
  count: {
    color: "var(--color-text-muted)",
    fontSize: "0.9rem",
  },
};