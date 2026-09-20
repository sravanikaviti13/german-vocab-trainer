import { useEffect, useRef, useState } from "react";
import { getAuthStatus, getStoredToken, storeToken, clearStoredToken, login } from "./api";

export default function LoginControl() {
  const [loginRequired, setLoginRequired] = useState(false);
  const [loggedIn, setLoggedIn] = useState(!!getStoredToken());
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);
  const boxRef = useRef();

  useEffect(() => {
    getAuthStatus()
      .then((s) => setLoginRequired(s.login_required))
      .catch(() => {}); // backend unreachable — just don't show the button
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  if (!loginRequired) return null; // no password configured on this deployment

  function handleLogout() {
    clearStoredToken();
    window.location.reload();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password || checking) return;
    setChecking(true);
    setError(null);
    try {
      const { token } = await login(password);
      storeToken(token);
      setLoggedIn(true);
      setOpen(false);
      window.location.reload(); // refetch everything now that requests carry the token
    } catch (err) {
      setError(err.response?.data?.detail || "Wrong password.");
    } finally {
      setChecking(false);
    }
  }

  if (loggedIn) {
    return (
      <button onClick={handleLogout} style={styles.iconBtn} title="Log out">
        🔓
      </button>
    );
  }

  return (
    <div ref={boxRef} style={styles.wrap}>
      <button onClick={() => setOpen((o) => !o)} style={styles.iconBtn} title="Log in">
        🔒
      </button>
      {open && (
        <form onSubmit={handleSubmit} style={styles.panel}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            style={styles.input}
            autoFocus
          />
          {error && <p style={styles.error}>{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={checking || !password} style={styles.submit}>
            {checking ? "Checking..." : "Log in"}
          </button>
        </form>
      )}
    </div>
  );
}

const styles = {
  wrap: { position: "relative" },
  iconBtn: {
    background: "var(--color-surface-alt)",
    border: "1px solid var(--color-border)",
    borderRadius: 6,
    padding: "4px 8px",
    fontSize: "1rem",
    lineHeight: 1,
  },
  panel: {
    position: "absolute",
    top: "calc(100% + 8px)",
    right: 0,
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    boxShadow: "var(--shadow-card)",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    width: 180,
    zIndex: 10,
  },
  input: {
    padding: "8px 10px",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-sm)",
    background: "var(--color-bg)",
    color: "var(--color-text)",
    fontSize: "0.95rem",
  },
  error: { color: "#c33", fontSize: "0.85rem", margin: 0 },
  submit: { padding: "6px 12px", fontSize: "0.9rem" },
};
