import { BrowserRouter, Routes, Route, Link, NavLink } from "react-router-dom";
import Library from "./pages/Library";
import Upload from "./pages/Upload";
import Practice from "./pages/Practice";
import ChapterDetail from "./pages/ChapterDetail";
import ArticleDrill from "./pages/ArticleDrill";
import Matching from "./pages/Matching";
import Graph from "./pages/Graph";
import SentencePractice from "./pages/SentencePractice";
import Grammar from "./pages/Grammar";
import AddWords from "./pages/AddWords";
import { useTheme } from "./theme.jsx";
import LoginControl from "./LoginControl.jsx";

export default function App() {
  const { theme, toggleTheme } = useTheme();

  return (
    <BrowserRouter>
      <div style={styles.shell}>
        <nav className="nav">
          <Link to="/" style={styles.brand}>Deutsch Vocab Trainer</Link>
          <div className="nav-links">
            <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              Library
            </NavLink>
            <NavLink to="/grammar" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              Grammar
            </NavLink>
            <NavLink to="/graph" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              Graph
            </NavLink>
            <NavLink to="/upload" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              Upload
            </NavLink>
            <button
              onClick={toggleTheme}
              style={styles.themeToggle}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              aria-label="Toggle dark mode"
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <LoginControl />
          </div>
        </nav>
        <main className="page-container">
          <Routes>
            <Route path="/" element={<Library />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/grammar" element={<Grammar />} />
            <Route path="/chapters/:chapterId" element={<ChapterDetail />} />
            <Route path="/chapters/:chapterId/add-words" element={<AddWords />} />
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
  brand: { fontWeight: 600, fontSize: "1.1rem", color: "var(--color-text)" },
  themeToggle: {
    background: "var(--color-surface-alt)",
    border: "1px solid var(--color-border)",
    borderRadius: 6,
    padding: "4px 8px",
    fontSize: "1rem",
    lineHeight: 1,
  },
};
