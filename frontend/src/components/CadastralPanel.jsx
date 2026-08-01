import React, { useState } from "react";
import api from "../api";

export default function CadastralPanel({ onLocate, onClose }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const search = async (e) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/api/parcels/search", { params: { q: q.trim() } });
      setResults(data.parcels || []);
      if (!data.parcels || data.parcels.length === 0) setError("查無符合的地段／地號");
    } catch (err) {
      setError(err?.response?.data?.error || "搜尋失敗");
    } finally {
      setLoading(false);
    }
  };

  const pick = async (p) => {
    try {
      const { data } = await api.get(`/api/parcels/${p.id}`);
      onLocate(data.parcel, { x: p.center_x, y: p.center_y });
    } catch {
      setError("讀取宗地圖形失敗");
    }
  };

  return (
    <div className="cadastral-panel">
      <div className="cadastral-panel-header">
        <h3>地籍圖搜尋</h3>
        <button className="btn-ghost" onClick={onClose}>
          關閉
        </button>
      </div>
      <form onSubmit={search} className="search-row">
        <input
          placeholder="輸入段小段或地號，例如：中崙段 123"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn-brass" type="submit" disabled={loading}>
          {loading ? "搜尋中…" : "搜尋"}
        </button>
      </form>
      {error && <div className="error-banner">{error}</div>}
      <div className="cadastral-results">
        {results.map((p) => (
          <div className="point-card" key={p.id} onClick={() => pick(p)} style={{ cursor: "pointer" }}>
            <h3>
              {p.county || ""}
              {p.town || ""} {p.section}
            </h3>
            <div className="coords mono">
              地號 {p.lot_no}
              {p.area_sqm ? ` ・ ${Number(p.area_sqm).toFixed(1)} m²` : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
