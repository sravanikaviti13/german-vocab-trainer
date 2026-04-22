import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Library from "./pages/Library";
import Upload from "./pages/Upload";
import Practice from "./pages/Practice";

export default function App() {
  return (
    <BrowserRouter>
      <div style={styles.shell}>
        <nav style={styles.nav}>
          <Link to="/" style={styles.brand}>Deutsch Vocab Trainer</Link>
          <div style={styles.links}>
            <Link to="/" style={styles.link}>Library</Link>
            <Link to="/upload" style={styles.link}>Upload</Link>
          </div>
        </nav>
        <main style={styles.main}>
          <Routes>
            <Route path="/" element={<Library />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/practice/:chapterId" element={<Practice />} />
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
    background: "white",
    borderBottom: "1px solid #e0e0e0",
  },
  brand: { fontWeight: 600, fontSize: "1.1rem" },
  links: { display: "flex", gap: 20 },
  link: { color: "#555" },
  main: { maxWidth: 900, margin: "0 auto", padding: 24 },
};