import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  GeoJSON,
  useMapEvents,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import api, { API_URL } from "../api";
import { socket } from "../socket";
import { useAuth } from "../context/AuthContext.jsx";
import PointModal from "../components/PointModal.jsx";
import MeasureLayer from "../components/MeasureLayer.jsx";
import CadastralPanel from "../components/CadastralPanel.jsx";

// Leaflet 預設圖示路徑修正（Vite 打包後路徑會跑掉）
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const BASEMAPS = {
  osm: {
    label: "街道圖 (OSM)",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors",
  },
  light: {
    label: "簡約底圖",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
  },
  satellite: {
    label: "衛星影像",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
  },
};

const menu = document.getElementById("basemapMenu");
const button = document.getElementById("basemapDropdown");

// Leaflet 底圖
let currentLayer = L.tileLayer(
  BASEMAPS.osm.url,
  { attribution: BASEMAPS.osm.attribution }
).addTo(map);

for (const [key, item] of Object.entries(BASEMAPS)) {
  const li = document.createElement("li");
  li.innerHTML = `
  <a class="dropdown-item" href="#">
  ${item.label}
  </a>
  `;
  li.onclick = () => {
    map.removeLayer(currentLayer);
    currentLayer = L.tileLayer(item.url, {
      attribution: item.attribution
    }).addTo(map);

    // 更新按鈕文字
    button.textContent = item.label;
    button.classList.add("dropdown-toggle");
  };
  menu.appendChild(li);
}

// 內政部國土測繪中心「國土測繪圖資服務雲」地籍圖 WMTS（段籍圖，免申請、公開使用）
const CADASTRAL_LAYER = {
  url: "https://wmts.nlsc.gov.tw/wmts/LANDSECT/default/EPSG:3857/{z}/{y}/{x}",
  attribution: "地籍圖資來源：內政部國土測繪中心",
  maxZoom: 18,
};

function ClickToAdd({ active, onPick }) {
  useMapEvents({
    click(e) {
      if (active) onPick(e.latlng);
    },
  });
  return null;
}

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.y, target.x], 16, { duration: 0.8 });
  }, [target]); // eslint-disable-line
  return null;
}

export default function MapPage() {
  const { user, logout } = useAuth();
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addMode, setAddMode] = useState(false);
  const [pendingLatLng, setPendingLatLng] = useState(null);
  const [editing, setEditing] = useState(null); // point object or null
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("all"); // 'all' | 'mine'
  const [search, setSearch] = useState("");
  const [basemap, setBasemap] = useState("osm");
  const [selected, setSelected] = useState(new Set());
  const [flyTarget, setFlyTarget] = useState(null);
  const [toast, setToast] = useState("");
  const [showChangePw, setShowChangePw] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const mapRef = useRef(null);

  const locateMe = () => {
    mapRef.current?.locate({ setView: true, maxZoom: 15 });
  };

  // 量測工具（距離 / 面積）
  const [measureMode, setMeasureMode] = useState(null); // null | 'distance' | 'area'
  const [measureResult, setMeasureResult] = useState(null);
  const [measureReset, setMeasureReset] = useState(0);

  // 地籍圖層與搜尋
  const [showCadastral, setShowCadastral] = useState(false);
  const [showCadastralPanel, setShowCadastralPanel] = useState(false);
  const [cadastralHighlight, setCadastralHighlight] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  // 初次載入所有點位
  useEffect(() => {
    api
      .get("/api/points")
      .then(({ data }) => setPoints(data.points))
      .catch(() => showToast("載入點位失敗"))
      .finally(() => setLoading(false));
  }, []);

  // Socket.io 即時同步
  useEffect(() => {
    socket.connect();
    socket.on("point:created", (p) => setPoints((prev) => [p, ...prev]));
    socket.on("point:updated", (p) =>
      setPoints((prev) => prev.map((pt) => (pt.id === p.id ? p : pt)))
    );
    socket.on("point:deleted", ({ id }) =>
      setPoints((prev) => prev.filter((pt) => pt.id !== id))
    );
    socket.on("point:batchDeleted", ({ ids }) =>
      setPoints((prev) => prev.filter((pt) => !ids.includes(pt.id)))
    );
    return () => {
      socket.off("point:created");
      socket.off("point:updated");
      socket.off("point:deleted");
      socket.off("point:batchDeleted");
      socket.disconnect();
    };
  }, []);

  const myPoints = useMemo(
    () => points.filter((p) => p.created_by === user?.id),
    [points, user]
  );

  const visiblePoints = useMemo(() => {
    const base = tab === "mine" ? myPoints : points;
    if (!search.trim()) return base;
    const q = search.trim().toLowerCase();
    return base.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q)
    );
  }, [tab, points, myPoints, search]);

  const canModify = (p) => user?.role === "admin" || p.created_by === user?.id;

  // --- 新增點位 ---
  const handlePick = (latlng) => {
    setPendingLatLng(latlng);
    setAddMode(false);
  };

  const submitNew = async (form) => {
    setSaving(true);
    try {
      await api.post("/api/points", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPendingLatLng(null);
      showToast("點位新增成功");
    } catch (err) {
      showToast(err?.response?.data?.error || "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  // --- 編輯點位 ---
  const submitEdit = async (form) => {
    setSaving(true);
    try {
      await api.put(`/api/points/${editing.id}`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setEditing(null);
      showToast("更新成功，同步更新資料");
    } catch (err) {
      showToast(err?.response?.data?.error || "更新失敗");
    } finally {
      setSaving(false);
    }
  };

  // --- 刪除 ---
  const deletePoint = async (p) => {
    if (!window.confirm(`確定要刪除「${p.name}」嗎？`)) return;
    try {
      await api.delete(`/api/points/${p.id}`);
      showToast("刪除成功");
    } catch (err) {
      showToast(err?.response?.data?.error || "權限不足，刪除失敗");
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const batchDelete = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`確定要刪除選取的 ${selected.size} 個點位嗎？`)) return;
    try {
      const { data } = await api.post("/api/points/batch-delete", {
        ids: Array.from(selected),
      });
      setSelected(new Set());
      if (data.skipped?.length) {
        showToast(`已刪除 ${data.deleted.length} 筆，${data.skipped.length} 筆權限不足未刪除`);
      } else {
        showToast(`已刪除 ${data.deleted.length} 筆`);
      }
    } catch {
      showToast("批次刪除失敗");
    }
  };

  const exportCSV = () => {
    const rows = [["id", "名稱", "x", "y", "描述", "建立者", "建立時間"]];
    visiblePoints.forEach((p) =>
      rows.push([p.id, p.name, p.x, p.y, p.description || "", p.created_by_name, p.created_at])
    );
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `points_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- 量測工具 ---
  const toggleMeasure = (mode) => {
    setMeasureMode((prev) => (prev === mode ? null : mode));
  };
  const clearMeasure = () => {
    setMeasureReset((v) => v + 1);
    setMeasureMode(null);
  };

  // --- 地籍圖搜尋定位 ---
  const handleParcelLocate = (parcel, center) => {
    setCadastralHighlight(parcel);
    if (center?.x && center?.y) {
      setFlyTarget({ x: center.x, y: center.y, t: Date.now() });
    }
    showToast(`已定位到 ${parcel.section || ""}${parcel.lot_no ? " 地號 " + parcel.lot_no : ""}`);
  };

  const copyShareLink = (p) => {
    const url = `${window.location.origin}/map?focus=${p.id}&x=${p.x}&y=${p.y}`;
    navigator.clipboard?.writeText(url);
    showToast("分享連結已複製");
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? "收合側欄" : "展開側欄"}
          >
            {sidebarOpen ? "◀" : "☰"}
          </button>
          <div className="topbar-brand">
            <h1>Web GIS 地圖系統</h1>
            <span className="sub">React + Leaflet + Socket.io 即時協作</span>
          </div>
        </div>

        <div className="topbar-right">
          <button className="btn-brass" onClick={() => setAddMode((v) => !v)}>
            {addMode ? "取消新增" : "＋ 新增點位"}
          </button>

          <select value={basemap} onChange={(e) => setBasemap(e.target.value)}>
            {Object.entries(BASEMAPS).map(([key, b]) => (
              <option key={key} value={key}>
                {b.label}
              </option>
            ))}
          </select>

          <label className="topbar-checkbox">
            <input
              type="checkbox"
              checked={showCadastral}
              onChange={(e) => setShowCadastral(e.target.checked)}
            />
            地籍圖
          </label>

          <button className="btn-ghost" onClick={() => setShowCadastralPanel((v) => !v)}>
            🔎 地籍搜尋
          </button>

          <div className="topbar-divider" />

          <button
            className={`btn-ghost ${measureMode === "distance" ? "active" : ""}`}
            onClick={() => toggleMeasure("distance")}
            title="量測距離"
          >
            📏 距離
          </button>
          <button
            className={`btn-ghost ${measureMode === "area" ? "active" : ""}`}
            onClick={() => toggleMeasure("area")}
            title="量測面積"
          >
            📐 面積
          </button>
          {(measureMode || measureResult) && (
            <button className="btn-ghost" onClick={clearMeasure} title="清除量測">
              ✕
            </button>
          )}

          <div className="topbar-divider" />

          <button className="btn-ghost" onClick={locateMe} title="定位到目前位置">
            📍 定位
          </button>
        </div>
      </header>

      <div className={`body-shell ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      <aside className="sidebar">
        <div className="user-pill">
          <span>{user?.username}</span>
          <span className={`role-tag ${user?.role}`}>
            {user?.role === "admin" ? "管理員" : "一般使用者"}
          </span>
        </div>

        <div className="tabs">
          <button className={`tab-btn ${tab === "all" ? "active" : ""}`} onClick={() => setTab("all")}>
            所有點位（{points.length}）
          </button>
          <button className={`tab-btn ${tab === "mine" ? "active" : ""}`} onClick={() => setTab("mine")}>
            我的點位（{myPoints.length}）
          </button>
        </div>

        <div className="sidebar-body">
          <div className="search-row">
            <input
              placeholder="搜尋名稱／描述"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {tab === "mine" && myPoints.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button className="btn-ghost" onClick={exportCSV} style={{ flex: 1 }}>
                匯出 CSV
              </button>
              <button
                className="btn-danger"
                onClick={batchDelete}
                disabled={selected.size === 0}
                style={{ flex: 1 }}
              >
                批次刪除（{selected.size}）
              </button>
            </div>
          )}

          {loading && <div className="empty-note">載入中…</div>}
          {!loading && visiblePoints.length === 0 && (
            <div className="empty-note">尚無點位，點擊右上角「新增點位」開始標記</div>
          )}

          {visiblePoints.map((p) => (
            <div className="point-card" key={p.id}>
              <div className="pc-top">
                {tab === "mine" && (
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggleSelect(p.id)}
                  />
                )}
                <div style={{ flex: 1 }}>
                  <h3>{p.name}</h3>
                  <div className="coords mono">
                    x {p.x} ／ y {p.y} ・ {p.created_by_name}
                  </div>
                </div>
              </div>
              {p.description && <p>{p.description}</p>}
              <div className="pc-actions">
                <button className="btn-ghost" onClick={() => setFlyTarget({ x: p.x, y: p.y, t: Date.now() })}>
                  導航
                </button>
                <button className="btn-ghost" onClick={() => copyShareLink(p)}>
                  分享
                </button>
                {canModify(p) && (
                  <>
                    <button className="btn-ghost" onClick={() => setEditing(p)}>
                      編輯
                    </button>
                    <button className="btn-danger" onClick={() => deletePoint(p)}>
                      刪除
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <button className="btn-danger" style={{ flex: 1 }} onClick={() => setShowChangePw(true)}>
            密碼變更
          </button>
          <button className="btn-danger" style={{ flex: 1 }} onClick={logout}>
            登出
          </button>
        </div>
      </aside>

      <div className="map-wrap">
        {addMode && <div className="add-mode-banner">請在地圖上點擊以放置新點位</div>}

        <MapContainer
          center={[25.033, 121.5654]}
          zoom={13}
          scrollWheelZoom
          whenCreated={(m) => (mapRef.current = m)}
        >
          <TileLayer url={BASEMAPS[basemap].url} attribution={BASEMAPS[basemap].attribution} />
          {showCadastral && (
            <TileLayer
              url={CADASTRAL_LAYER.url}
              attribution={CADASTRAL_LAYER.attribution}
              maxZoom={CADASTRAL_LAYER.maxZoom}
            />
          )}
          {cadastralHighlight && (
            <GeoJSON
              key={cadastralHighlight.id}
              data={cadastralHighlight.geometry}
              style={{ color: "#ff8c00", weight: 3, fillOpacity: 0.12 }}
            />
          )}
          <MeasureLayer mode={measureMode} onResult={setMeasureResult} resetSignal={measureReset} />
          <ClickToAdd active={addMode} onPick={handlePick} />
          <FlyTo target={flyTarget} />

          {visiblePoints.map((p) => (
            <Marker key={p.id} position={[p.y, p.x]}>
              <Popup>
                <div className="popup-body">
                  <h3>{p.name}</h3>
                  <div className="coords mono">x {p.x} ／ y {p.y}</div>
                  {p.description && <div>{p.description}</div>}
                  {p.image_path && <img src={`${API_URL}${p.image_path}`} alt={p.name} />}
                  <div style={{ marginTop: 4, fontSize: 11, color: "#5b6b78" }}>
                    建立者：{p.created_by_name}
                  </div>
                  <div className="popup-actions">
                    {canModify(p) && (
                      <>
                        <button className="btn-ghost" onClick={() => setEditing(p)}>
                          編輯
                        </button>
                        <button className="btn-danger" onClick={() => deletePoint(p)}>
                          刪除
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {measureMode && (
          <div className="add-mode-banner">
            {measureMode === "distance" ? "點擊地圖以量測距離（可連續點擊多點）" : "點擊地圖以量測面積（至少 3 點）"}
          </div>
        )}
        {measureResult && (
          <div className="toolbar-card" style={{ position: "absolute", bottom: 14, left: 14, zIndex: 500 }}>
            {measureResult}
          </div>
        )}

        {showCadastralPanel && (
          <CadastralPanel
            onLocate={handleParcelLocate}
            onClose={() => setShowCadastralPanel(false)}
          />
        )}

        {toast && <div className="add-mode-banner" style={{ bottom: 20, top: "auto" }}>{toast}</div>}
      </div>
      </div>

      {pendingLatLng && (
        <PointModal
          initial={{ x: pendingLatLng.lng.toFixed(6), y: pendingLatLng.lat.toFixed(6) }}
          onCancel={() => setPendingLatLng(null)}
          onSubmit={submitNew}
          saving={saving}
        />
      )}

      {editing && (
        <PointModal
          initial={editing}
          onCancel={() => setEditing(null)}
          onSubmit={submitEdit}
          saving={saving}
        />
      )}

      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
    </div>
  );
}

function ChangePasswordModal({ onClose }) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api.post("/api/auth/change-password", { oldPassword, newPassword });
      setOkMsg("密碼已更新");
      setTimeout(onClose, 1000);
    } catch (err) {
      setError(err?.response?.data?.error || "變更失敗");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
        <h2>變更密碼</h2>
        <p className="modal-sub">設定與帳號</p>
        {error && <div className="error-banner">{error}</div>}
        {okMsg && <div className="error-banner" style={{ background: "#e7f4ee", color: "#2f7d5e", borderColor: "#bfe3d1" }}>{okMsg}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label>舊密碼</label>
            <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required />
          </div>
          <div className="field">
            <label>新密碼（至少 6 碼）</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn-brass" disabled={saving}>
              {saving ? "更新中…" : "更新密碼"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
