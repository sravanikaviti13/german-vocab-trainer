import { useEffect, useState } from "react";
import { getAuthStatus, getStoredToken, storeToken, login } from "./api";

export default function AuthGate({ children }) {
  const [token, setToken] = useState(getStoredToken());
  const [loginRequired, setLoginRequired] = useState(null); // null = still checking
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (token) return; // already have a token, no need to check
    getAuthStatus()
      .then((s) => setLoginRequired(s.login_required))
      .catch(() => setLoginRequired(false)); // backend unreachable — don't hard-block on that
  }, [token]);

  if (token || loginRequired === false) return children;

  if (loginRequired === null) return null; // brief check, avoid a login-form flash

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password || checking) return;
    setChecking(true);
    setError(null);
    try {
      const { token: newToken } = await login(password);
      storeToken(newToken);
      setToken(newToken);
    } catch (err) {
      setError(err.response?.data?.detail || "Something went wrong.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <form onSubmit={handleSubmit} className="card" style={styles.card}>
        <h1 style={styles.title}>Deutsch Vocab Trainer</h1>
        <p style={styles.subtitle}>Enter the password to continue</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          style={styles.input}
          autoFocus
        />
        {error && <p style={styles.error}>{error}</p>}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={checking || !password}
          style={styles.button}
        >
          {checking ? "Checking..." : "Continue"}
        </button>
      </form>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--color-bg)",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  title: { fontSize: "1.3rem", fontWeight: 600, color: "var(--color-text)", margin: 0 },
  subtitle: { color: "var(--color-text-secondary)", margin: 0, fontSize: "0.95rem" },
  input: {
    padding: "10px 12px",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-sm)",
    background: "var(--color-surface)",
    color: "var(--color-text)",
    fontSize: "1rem",
  },
  error: { color: "#c33", fontSize: "0.9rem", margin: 0 },
  button: { padding: "10px 16px" },
};
