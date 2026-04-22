import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { uploadPdf } from "../api";

export default function Upload() {
  const [file, setFile] = useState(null);
  const [book, setBook] = useState("");
  const [chapter, setChapter] = useState("");
  const [pages, setPages] = useState(3);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file || !book || !chapter) {
      setStatus("Please fill all fields.");
      return;
    }
    setBusy(true);
    setStatus("Uploading and processing... this can take 30-60 seconds for scanned PDFs.");
    try {
      const result = await uploadPdf(file, book, chapter, pages);
      setStatus(`Done! Saved ${result.words_saved} words.`);
      setTimeout(() => navigate("/"), 1500);
    } catch (err) {
      setStatus(`Error: ${err.response?.data?.detail || err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.container}>
      <h2>Upload a PDF</h2>
      <form onSubmit={handleSubmit} style={styles.form}>
        <label style={styles.label}>
          Book title
          <input
            value={book}
            onChange={(e) => setBook(e.target.value)}
            placeholder="e.g. Spektrum Deutsch A2+"
            style={styles.input}
          />
        </label>
        <label style={styles.label}>
          Chapter title
          <input
            value={chapter}
            onChange={(e) => setChapter(e.target.value)}
            placeholder="e.g. Ausflugsziele"
            style={styles.input}
          />
        </label>
        <label style={styles.label}>
          Max pages to process
          <input
            type="number"
            min={1}
            max={20}
            value={pages}
            onChange={(e) => setPages(Number(e.target.value))}
            style={styles.input}
          />
        </label>
        <label style={styles.label}>
          PDF file
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files[0])}
            style={styles.input}
          />
        </label>
        <button type="submit" disabled={busy} style={styles.button}>
          {busy ? "Processing..." : "Upload & Extract Vocabulary"}
        </button>
      </form>
      {status && <p style={styles.status}>{status}</p>}
    </div>
  );
}

const styles = {
  container: { maxWidth: 500 },
  form: { display: "flex", flexDirection: "column", gap: 12 },
  label: { display: "flex", flexDirection: "column", fontSize: "0.9rem", color: "#555" },
  input: { padding: 8, borderRadius: 6, border: "1px solid #ccc", marginTop: 4 },
  button: {
    padding: "10px 16px",
    background: "#0066cc",
    color: "white",
    border: "none",
    borderRadius: 6,
    fontSize: "1rem",
  },
  status: { marginTop: 16, padding: 12, background: "white", borderRadius: 6 },
};