const express = require("express");
const { query } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// 取得所有「段」清單
// 資料庫的 section 欄位為「OO段OO小段」組合字串，這裡以第一個「段」字切出段名稱
// GET /api/parcels/sections
router.get("/sections", requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT DISTINCT substring(section from '^(.*?段)') AS duan
         FROM parcels
        WHERE section ~ '段'
        ORDER BY duan`
    );
    res.json({ sections: rows.map((r) => r.duan).filter(Boolean) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "讀取段別清單失敗" });
  }
});

// 取得指定「段」底下的「小段」清單（供第二個下拉選單使用）
// GET /api/parcels/subsections?duan=OO段
router.get("/subsections", requireAuth, async (req, res) => {
  try {
    const duan = (req.query.duan || "").trim();
    if (!duan) return res.json({ subsections: [] });
    const { rows } = await query(
      `SELECT DISTINCT NULLIF(substring(section from '^.*?段(.*)$'), '') AS xiaoduan
         FROM parcels
        WHERE substring(section from '^(.*?段)') = $1
        ORDER BY xiaoduan NULLS FIRST`,
      [duan]
    );
    res.json({ subsections: rows.map((r) => r.xiaoduan || "") });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "讀取小段清單失敗" });
  }
});

// 依「段小段 / 地號 / 縣市 / 鄉鎮」關鍵字模糊搜尋地籍宗地
// 亦支援結構化搜尋：段(duan) + 小段(xiaoduan) + 地號(lot)
// GET /api/parcels/search?q=關鍵字&limit=20
// GET /api/parcels/search?duan=OO段&xiaoduan=OO小段&lot=123
router.get("/search", requireAuth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const duan = (req.query.duan || "").trim();

    // 結構化搜尋（下拉選段/小段 + 輸入地號）
    if (duan) {
      const xiaoduan = (req.query.xiaoduan || "").trim();
      const lot = (req.query.lot || "").trim();
      const section = `${duan}${xiaoduan}`;
      const { rows } = await query(
        `SELECT id, county, town, section, lot_no, area_sqm, landuse,
                ST_X(ST_Centroid(geom)) AS center_x,
                ST_Y(ST_Centroid(geom)) AS center_y
           FROM parcels
          WHERE section = $1 AND ($2 = '' OR lot_no ILIKE $2)
          ORDER BY lot_no
          LIMIT $3`,
        [section, lot ? `%${lot}%` : "", limit]
      );
      return res.json({ parcels: rows });
    }

    // 舊版關鍵字模糊搜尋（維持相容）
    const q = (req.query.q || "").trim();
    if (!q) return res.json({ parcels: [] });

    const { rows } = await query(
      `SELECT id, county, town, section, lot_no, area_sqm, landuse,
              ST_X(ST_Centroid(geom)) AS center_x,
              ST_Y(ST_Centroid(geom)) AS center_y
         FROM parcels
        WHERE section ILIKE $1 OR lot_no ILIKE $1
           OR county ILIKE $1 OR town ILIKE $1
           OR (section || lot_no) ILIKE $1
        ORDER BY section, lot_no
        LIMIT $2`,
      [`%${q}%`, limit]
    );
    res.json({ parcels: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "地籍搜尋失敗" });
  }
});

// 取得單一宗地完整幾何（GeoJSON），供地圖上繪製框選/高亮
// GET /api/parcels/:id
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, county, town, section, lot_no, area_sqm, landuse,
              ST_AsGeoJSON(geom)::json AS geometry
         FROM parcels WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "找不到此宗地" });
    res.json({ parcel: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "查詢失敗" });
  }
});

// 點選地圖座標，查詢該點落在哪一筆宗地內（地籍圖「點選查詢」功能）
// GET /api/parcels/at?lng=121.56&lat=25.03
router.get("/at/point", requireAuth, async (req, res) => {
  try {
    const { lng, lat } = req.query;
    if (lng === undefined || lat === undefined) {
      return res.status(400).json({ error: "請提供 lng 與 lat" });
    }
    const { rows } = await query(
      `SELECT id, county, town, section, lot_no, area_sqm, landuse,
              ST_AsGeoJSON(geom)::json AS geometry
         FROM parcels
        WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
        LIMIT 1`,
      [Number(lng), Number(lat)]
    );
    res.json({ parcel: rows[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "查詢失敗" });
  }
});

module.exports = router;
