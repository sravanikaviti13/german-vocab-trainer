import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Library from "./pages/Library";
import Upload from "./pages/Upload";
import Practice from "./pages/Practice";
import ChapterDetail from "./pages/ChapterDetail";
import ArticleDrill from "./pages/ArticleDrill";
import Matching from "./pages/Matching";
import Graph from "./pages/Graph";
import SentencePractice from "./pages/SentencePractice";
import { useTheme } from "./theme.jsx";

export default function App() {
  const { theme, toggleTheme } = useTheme();

  return (
    <BrowserRouter>
      <div style={styles.shell}>
        <nav style={styles.nav}>
          <Link to="/" style={styles.brand}>Deutsch Vocab Trainer</Link>
          <div style={styles.links}>
            <Link to="/" style={styles.link}>Library</Link>
            <Link to="/graph" style={styles.link}>Graph</Link>
            <Link to="/upload" style={styles.link}>Upload</Link>
            <button
              onClick={toggleTheme}
              style={styles.themeToggle}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              aria-label="Toggle dark mode"
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
          </div>
        </nav>
        <main style={styles.main}>
          <Routes>
            <Route path="/" element={<Library />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/chapters/:chapterId" element={<ChapterDetail />} />
            <Route path="/practice/:chapterId" element={<Practice />} />
            <Route path="/drill/:chapterId/articles" element={<ArticleDrill />} />
            <Route path="/match/:chapterId" element={<Matching />} />
            <Route path="/graph" element={<Graph />} />
            <Route path="/sentences/:chapterId" element={<SentencePractice />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

const styles = {
  shell: { minHeight: "100vh" },
  nav: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 24px",
    background: "var(--color-surface)",
    borderBottom: "1px solid var(--color-border)",
  },
  brand: { fontWeight: 600, fontSize: "1.1rem", color: "var(--color-text)" },
  links: { display: "flex", gap: 20, alignItems: "center" },
  link: { color: "var(--color-text-secondary)" },
  themeToggle: {
    background: "var(--color-surface-alt)",
    border: "1px solid var(--color-border)",
    borderRadius: 6,
    padding: "4px 8px",
    fontSize: "1rem",
    lineHeight: 1,
  },
  main: { maxWidth: 900, margin: "0 auto", padding: 24 },
};
