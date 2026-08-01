import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      navigate("/map");
    } catch (err) {
      setError(err?.response?.data?.error || "登入失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-mark">
          <span className="dot" />
          <h1>Web GIS 地圖系統</h1>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={onSubmit}>
          <div className="field">
            <label>帳號</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="field">
            <label>密碼</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button className="btn-brass" type="submit" disabled={loading} style={{ width: "100%" }}>
            {loading ? "登入中…" : "登入"}
          </button>
        </form>
        <div className="switch-link">
          還沒有帳號？<Link to="/register">註冊新帳號</Link>
        </div>
      </div>
    </div>
  );
}
