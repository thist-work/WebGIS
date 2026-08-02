import React, { useEffect, useState } from "react";
import api from "../api";

export default function CadastralPanel({ onLocate, onClose }) {
  const [sections, setSections] = useState([]); // 段清單
  const [subsections, setSubsections] = useState([]); // 小段清單
  const [duan, setDuan] = useState(""); // 選擇的段
  const [xiaoduan, setXiaoduan] = useState(""); // 選擇的小段
  const [lot, setLot] = useState(""); // 輸入的地號

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [error, setError] = useState("");

  // 載入「段」下拉選單清單
  useEffect(() => {
    setLoadingMeta(true);
    api
      .get("/api/parcels/sections")
      .then(({ data }) => setSections(data.sections || []))
      .catch(() => setError("讀取段別清單失敗"))
      .finally(() => setLoadingMeta(false));
  }, []);

  // 段變更時，載入對應的「小段」下拉選單清單
  useEffect(() => {
    setXiaoduan("");
    setSubsections([]);
    if (!duan) return;
    api
      .get("/api/parcels/subsections", { params: { duan } })
      .then(({ data }) => setSubsections(data.subsections || []))
      .catch(() => setError("讀取小段清單失敗"));
  }, [duan]);

  const locateParcel = async (p) => {
    try {
      const { data } = await api.get(`/api/parcels/${p.id}`);
      onLocate(data.parcel, { x: p.center_x, y: p.center_y });
    } catch {
      setError("讀取宗地圖形失敗");
    }
  };

  const search = async (e) => {
    e?.preventDefault();
    if (!duan) {
      setError("請先選擇「段」");
      return;
    }
    setLoading(true);
    setError("");
    setResults([]);
    try {
      const { data } = await api.get("/api/parcels/search", {
        params: { duan, xiaoduan, lot: lot.trim() },
      });
      const parcels = data.parcels || [];
      if (parcels.length === 0) {
        setError("查無符合的地號，請確認段／小段／地號是否正確");
      } else if (parcels.length === 1) {
        // 唯一結果，直接定位並 flyTo
        await locateParcel(parcels[0]);
      } else {
        // 多筆結果，列出讓使用者選擇
        setResults(parcels);
      }
    } catch (err) {
      setError(err?.response?.data?.error || "搜尋失敗");
    } finally {
      setLoading(false);
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

      <form onSubmit={search}>
        <div className="cadastral-select-row">
          <select
            className="select-modern"
            value={duan}
            onChange={(e) => setDuan(e.target.value)}
            disabled={loadingMeta}
          >
            <option value="">{loadingMeta ? "載入中…" : "選擇段"}</option>
            {sections.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            className="select-modern"
            value={xiaoduan}
            onChange={(e) => setXiaoduan(e.target.value)}
            disabled={!duan}
          >
            <option value="">{duan ? "（無小段）" : "選擇小段"}</option>
            {subsections.filter(Boolean).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="search-row">
          <input
            className="input-modern mono"
            type="text"
            inputMode="numeric"
            placeholder="輸入地號，例如12或12-3"
            value={lot}
            onChange={(e) => setLot(e.target.value)}
          />
          <button className="btn-brass" type="submit" disabled={loading || !duan}>
            {loading ? "搜尋中…" : "搜尋"}
          </button>
        </div>
      </form>

      {error && <div className="error-banner">{error}</div>}

      <div className="cadastral-results">
        {results.map((p) => (
          <div className="point-card" key={p.id} onClick={() => locateParcel(p)} style={{ cursor: "pointer" }}>
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
