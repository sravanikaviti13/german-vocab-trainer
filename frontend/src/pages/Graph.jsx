import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ForceGraph2D from "react-force-graph-2d";
import { getGraph, listBooks } from "../api";
import { useTheme } from "../theme.jsx";

const POS_COLORS = {
  noun: "#1976d2",
  verb: "#d32f2f",
  adjective: "#7b1fa2",
  adverb: "#f57c00",
};

export default function Graph() {
  const { theme } = useTheme();
  const [scope, setScope] = useState("book");
  const [selectedId, setSelectedId] = useState(null);
  const [books, setBooks] = useState([]);
  const [data, setData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);
  const [minEdgeWeight, setMinEdgeWeight] = useState(2);

  const fgRef = useRef();

  // Load the list of books so user can pick one
  useEffect(() => {
    listBooks().then(setBooks);
  }, []);

  // Fetch graph whenever scope or selected id changes
  useEffect(() => {
    if (scope !== "all" && selectedId === null) return;
    setLoading(true);
    getGraph(scope, selectedId)
      .then((g) => {
        // react-force-graph-2d uses "links" not "edges"
        setData({
          nodes: g.nodes.map((n) => ({ ...n })),
          links: g.edges.map((e) => ({
            source: e.source,
            target: e.target,
            weight: e.weight,
          })),
        });
      })
      .finally(() => setLoading(false));
  }, [scope, selectedId]);

  // Compute chapter picker options based on scope
  const scopeOptions = [];
  if (scope === "book") {
    books.forEach((b) => scopeOptions.push({ id: b.id, label: b.title }));
  } else if (scope === "chapter") {
    books.forEach((b) =>
      b.chapters.forEach((c) =>
        scopeOptions.push({ id: c.id, label: `${b.title} · ${c.title}` })
      )
    );
  }

  // Auto-select first option when switching scope
  useEffect(() => {
    if (scope === "all") {
      setSelectedId(null);
    } else if (scopeOptions.length > 0 && !scopeOptions.some((o) => o.id === selectedId)) {
      setSelectedId(scopeOptions[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, books.length]);

  // Auto-select first book once books load (initial page load)
  useEffect(() => {
    if (scope === "book" && selectedId === null && books.length > 0) {
        setSelectedId(books[0].id);
    }
  }, [books, scope, selectedId]);

  // Filter edges by minimum weight (before they get to the graph)
  const filteredData = {
    nodes: data.nodes,
    links: data.links.filter((l) => l.weight >= minEdgeWeight),
  };

  // Visual encoding helpers
  function nodeSize(node) {
    // Base 4, grows with usage
    return 4 + Math.sqrt(node.times_seen) * 1.2 + node.chapter_count * 0.5;
  }

  function nodeColor(node) {
    const baseColor = POS_COLORS[node.pos] || "#888";
    if (node.times_seen === 0) return "#d0d0d0"; // untouched = grey

    // Strength 0–5 → opacity 0.4 to 1.0
    const alpha = 0.4 + (node.strength / 5) * 0.6;
    return hexToRgba(baseColor, alpha);
  }

  return (
    <div style={styles.page}>
      <div style={styles.controls}>
        <div style={styles.controlGroup}>
          <label style={styles.label}>Scope:</label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            style={styles.select}
          >
            <option value="all">All vocabulary</option>
            <option value="book">One book</option>
            <option value="chapter">One chapter</option>
          </select>
        </div>

        {scope !== "all" && (
          <div style={styles.controlGroup}>
            <label style={styles.label}>
              {scope === "book" ? "Book:" : "Chapter:"}
            </label>
            <select
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(Number(e.target.value))}
              style={styles.select}
            >
              {scopeOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={styles.controlGroup}>
          <label style={styles.label}>Min connection:</label>
          <select
            value={minEdgeWeight}
            onChange={(e) => setMinEdgeWeight(Number(e.target.value))}
            style={styles.select}
          >
            <option value={1}>1+ (show all)</option>
            <option value={2}>2+ chapters</option>
            <option value={3}>3+ chapters</option>
          </select>
        </div>

        <div style={styles.stats}>
          {filteredData.nodes.length} words · {filteredData.links.length} connections
        </div>
      </div>

      <div style={styles.legend}>
        <span style={styles.legendItem}>
            <span style={{ ...styles.dot, background: POS_COLORS.noun }} /> Noun
        </span>
        <span style={styles.legendItem}>
            <span style={{ ...styles.dot, background: POS_COLORS.verb }} /> Verb
        </span>
        <span style={styles.legendItem}>
            <span style={{ ...styles.dot, background: POS_COLORS.adjective }} /> Adjective
        </span>
        <span style={styles.legendItem}>
            <span style={{ ...styles.dot, background: "#d0d0d0" }} /> Untouched
        </span>
        {scope === "chapter" && (
            <span style={styles.legendItem}>
            <span style={{ ...styles.ring, borderColor: "#ff6b00" }} /> In this chapter
            </span>
        )}
        <span style={styles.legendNote}>
            Size = usage · Darkness = strength
        </span>
      </div>

      <div style={styles.graphWrap}>
        {loading ? (
          <div style={styles.loading}>Loading graph…</div>
        ) : filteredData.nodes.length === 0 ? (
          <div style={styles.loading}>No words in this scope.</div>
        ) : (
          <ForceGraph2D
            ref={fgRef}
            graphData={filteredData}
            nodeRelSize={1}
            nodeVal={(n) => Math.pow(nodeSize(n), 2)}
            nodeLabel={(n) => `${n.article ? n.article + " " : ""}${n.lemma} — ${n.english}`}
            nodeColor={nodeColor}
            linkColor={() => "rgba(150,150,150,0.25)"}
            linkWidth={(l) => Math.min(3, Math.sqrt(l.weight))}
            onNodeClick={(node) => {
              setSelectedNode(node);
              fgRef.current?.centerAt(node.x, node.y, 500);
              fgRef.current?.zoom(2, 500);
            }}
            cooldownTicks={100}
            nodeCanvasObjectMode={() => "after"}
            nodeCanvasObject={(node, ctx, globalScale) => {
            // Highlight ring for seed words in chapter scope
            if (node.highlighted) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, nodeSize(node) + 3, 0, 2 * Math.PI);
                ctx.strokeStyle = "#ff6b00";
                ctx.lineWidth = 2 / globalScale;
                ctx.stroke();
            }

            // Labels when zoomed in
            if (globalScale < 1.4) return;
            const label = node.lemma;
            const fontSize = 10 / globalScale;
            ctx.font = `${fontSize}px -apple-system, sans-serif`;
            ctx.fillStyle = theme === "dark" ? "#e8e8ea" : "#222";
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillText(label, node.x, node.y + nodeSize(node) + 2);
            }}
          />
        )}
      </div>

      {selectedNode && (
        <div style={styles.panel}>
          <button onClick={() => setSelectedNode(null)} style={styles.close}>×</button>
          <p style={styles.panelPos}>{selectedNode.pos}</p>
          <h3 style={styles.panelTitle}>
            {selectedNode.article && <span style={styles.article}>{selectedNode.article} </span>}
            {selectedNode.lemma}
          </h3>
          <p style={styles.panelEnglish}>{selectedNode.english}</p>
          <hr style={styles.hr} />
          <div style={styles.panelStats}>
            <Stat label="Reviews" value={selectedNode.times_seen} />
            <Stat label="Strength" value={`${selectedNode.strength}/5`} />
            <Stat
              label="Accuracy"
              value={
                selectedNode.accuracy === null
                  ? "—"
                  : `${Math.round(selectedNode.accuracy * 100)}%`
              }
            />
            <Stat label="Chapters" value={selectedNode.chapter_count} />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={statStyles.wrap}>
      <div style={statStyles.value}>{value}</div>
      <div style={statStyles.label}>{label}</div>
    </div>
  );
}

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const statStyles = {
  wrap: { textAlign: "center", minWidth: 60 },
  value: { fontSize: "1.3rem", fontWeight: 600 },
  label: { color: "var(--color-text-muted)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: 0.5 },
};

const styles = {
  page: {
    position: "relative",
    height: "calc(100vh - 100px)",
    display: "flex",
    flexDirection: "column",
    background: "var(--color-surface)",
    borderRadius: 12,
    overflow: "hidden",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  },
  controls: {
    display: "flex",
    flexWrap: "wrap",
    gap: 14,
    padding: "12px 16px",
    borderBottom: "1px solid var(--color-border-soft)",
    alignItems: "center",
  },
  controlGroup: { display: "flex", alignItems: "center", gap: 6 },
  label: { color: "var(--color-text-secondary)", fontSize: "0.85rem" },
  select: {
    padding: "4px 8px",
    borderRadius: 6,
    border: "1px solid var(--color-border)",
    fontSize: "0.9rem",
    background: "var(--color-surface)",
    color: "var(--color-text)",
  },
  stats: { marginLeft: "auto", color: "var(--color-text-muted)", fontSize: "0.85rem" },

  legend: {
    display: "flex",
    flexWrap: "wrap",
    gap: 16,
    padding: "8px 16px",
    borderBottom: "1px solid var(--color-border-soft)",
    fontSize: "0.8rem",
    color: "var(--color-text-secondary)",
    alignItems: "center",
  },
  legendItem: { display: "flex", alignItems: "center", gap: 5 },
  dot: {
    width: 10, height: 10, borderRadius: "50%", display: "inline-block",
  },
  legendNote: { marginLeft: "auto", fontStyle: "italic" },

  graphWrap: { flex: 1, position: "relative" },
  loading: {
    position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
    color: "var(--color-text-muted)",
  },

  panel: {
    position: "absolute",
    right: 16,
    top: 100,
    width: 280,
    background: "var(--color-surface)",
    borderRadius: 10,
    boxShadow: "0 4px 14px rgba(0,0,0,0.15)",
    padding: 20,
  },
  close: {
    position: "absolute", top: 8, right: 10,
    background: "none", border: "none", fontSize: "1.3rem", color: "var(--color-text-muted)",
  },
  panelPos: { color: "var(--color-text-muted)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: 1 },
  panelTitle: { fontSize: "1.6rem", margin: "4px 0 8px" },
  article: { color: "var(--color-link)" },
  panelEnglish: { color: "var(--color-text-secondary)" },
  hr: { border: "none", borderTop: "1px solid var(--color-border-soft)", margin: "14px 0" },
  panelStats: { display: "flex", gap: 6, justifyContent: "space-between" },

  ring: {
  width: 10, height: 10, borderRadius: "50%", display: "inline-block",
  border: "2px solid",
  boxSizing: "border-box",
},
};