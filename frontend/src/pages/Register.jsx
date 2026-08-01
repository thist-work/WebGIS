import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(username, email, password);
      navigate("/map");
    } catch (err) {
      setError(err?.response?.data?.error || "註冊失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-mark">
          <span className="dot" />
          <h1>註冊新帳號</h1>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={onSubmit}>
          <div className="field">
            <label>帳號</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="field">
            <label>Email（選填）</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label>密碼（至少 6 碼）</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <button className="btn-brass" type="submit" disabled={loading} style={{ width: "100%" }}>
            {loading ? "註冊中…" : "註冊並登入"}
          </button>
        </form>
        <div className="switch-link">
          已經有帳號？<Link to="/login">前往登入</Link>
        </div>
      </div>
    </div>
  );
}
