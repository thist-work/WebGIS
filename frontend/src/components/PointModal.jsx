import React, { useState } from "react";
import { API_URL } from "../api";

export default function PointModal({ initial, onCancel, onSubmit, saving }) {
  const isEdit = Boolean(initial?.id);
  const [x, setX] = useState(initial?.x ?? "");
  const [y, setY] = useState(initial?.y ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");

  const existingImage = initial?.image_path ? `${API_URL}${initial.image_path}` : null;

  const submit = (e) => {
    e.preventDefault();
    if (x === "" || y === "" || !name.trim()) {
      setError("x座標、y座標、名稱為必填");
      return;
    }
    setError("");
    const form = new FormData();
    form.append("x", x);
    form.append("y", y);
    form.append("name", name);
    form.append("description", description);
    if (file) form.append("image", file);
    onSubmit(form);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
        <h2>{isEdit ? "編輯點位" : "新增點位"}</h2>
        <p className="modal-sub">
          {isEdit ? "修改座標、名稱、描述或照片" : "填寫座標與名稱後儲存，所有在線使用者將即時看到"}
        </p>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={submit}>
          <div className="coord-row">
            <div className="field">
              <label>X 座標（必填）</label>
              <input
                className="mono"
                type="number"
                step="any"
                value={x}
                onChange={(e) => setX(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Y 座標（必填）</label>
              <input
                className="mono"
                type="number"
                step="any"
                value={y}
                onChange={(e) => setY(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="field">
            <label>名稱（必填）</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label>描述（選填）</label>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="field">
            <label>圖片（選填）</label>
            {existingImage && !file && (
              <img src={existingImage} alt="目前圖片" className="modal-thumb" />
            )}
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0] || null)} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onCancel}>
              取消
            </button>
            <button type="submit" className="btn-brass" disabled={saving}>
              {saving ? "儲存中…" : "儲存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
