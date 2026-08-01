const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { query } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error("只允許上傳圖片檔"));
  },
});

function canModify(user, point) {
  return user.role === "admin" || point.created_by === user.id;
}

// 取得所有點位
router.get("/", requireAuth, async (req, res) => {
  try {
    const { rows } = await query("SELECT * FROM points ORDER BY id DESC");
    res.json({ points: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "載入點位失敗" });
  }
});

// 新增點位
router.post("/", requireAuth, upload.single("image"), async (req, res) => {
  try {
    const { x, y, name, description } = req.body;
    if (x === undefined || y === undefined || !name) {
      return res.status(400).json({ error: "座標與名稱為必填" });
    }
    const image_path = req.file ? `/uploads/${req.file.filename}` : null;

    const { rows } = await query(
      `INSERT INTO points (x, y, geom, name, description, image_path, created_by, created_by_name)
       VALUES ($1, $2, ST_SetSRID(ST_MakePoint($1, $2), 4326), $3, $4, $5, $6, $7)
       RETURNING *`,
      [Number(x), Number(y), name, description || null, image_path, req.user.id, req.user.username]
    );

    const point = rows[0];
    req.app.get("io").emit("point:created", point);
    res.status(201).json({ point });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "新增點位失敗" });
  }
});

// 編輯點位（僅建立者或管理員）
router.put("/:id", requireAuth, upload.single("image"), async (req, res) => {
  try {
    const { rows: existingRows } = await query("SELECT * FROM points WHERE id = $1", [
      req.params.id,
    ]);
    const point = existingRows[0];
    if (!point) return res.status(404).json({ error: "找不到此點位" });
    if (!canModify(req.user, point)) {
      return res.status(403).json({ error: "權限不足，僅能編輯自己新增的點位" });
    }

    const { x, y, name, description } = req.body;
    const image_path = req.file ? `/uploads/${req.file.filename}` : point.image_path;
    const nextX = x !== undefined ? Number(x) : point.x;
    const nextY = y !== undefined ? Number(y) : point.y;

    const { rows } = await query(
      `UPDATE points
         SET x = $1, y = $2, geom = ST_SetSRID(ST_MakePoint($1, $2), 4326),
             name = $3, description = $4, image_path = $5, updated_at = now()
       WHERE id = $6
       RETURNING *`,
      [nextX, nextY, name || point.name, description !== undefined ? description : point.description, image_path, point.id]
    );

    const updated = rows[0];
    req.app.get("io").emit("point:updated", updated);
    res.json({ point: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "更新點位失敗" });
  }
});

// 刪除單一點位（僅建立者或管理員）
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { rows } = await query("SELECT * FROM points WHERE id = $1", [req.params.id]);
    const point = rows[0];
    if (!point) return res.status(404).json({ error: "找不到此點位" });
    if (!canModify(req.user, point)) {
      return res.status(403).json({ error: "權限不足，僅能刪除自己新增的點位" });
    }
    await query("DELETE FROM points WHERE id = $1", [point.id]);
    req.app.get("io").emit("point:deleted", { id: point.id });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "刪除點位失敗" });
  }
});

// 批次刪除（僅刪除自己有權限的點位；管理員可刪任何點位）
router.post("/batch-delete", requireAuth, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "請提供要刪除的 id 陣列" });
    }
    const deleted = [];
    const skipped = [];
    for (const id of ids) {
      const { rows } = await query("SELECT * FROM points WHERE id = $1", [id]);
      const point = rows[0];
      if (!point) continue;
      if (!canModify(req.user, point)) {
        skipped.push(id);
        continue;
      }
      await query("DELETE FROM points WHERE id = $1", [id]);
      deleted.push(id);
    }

    if (deleted.length > 0) {
      req.app.get("io").emit("point:batchDeleted", { ids: deleted });
    }
    res.json({ deleted, skipped });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "批次刪除失敗" });
  }
});

module.exports = router;
