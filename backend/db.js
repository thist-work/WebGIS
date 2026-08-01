const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
require("dotenv").config();

if (!process.env.DATABASE_URL) {
  console.error(
    "❌ 找不到 DATABASE_URL 環境變數，請在 .env 中設定 Supabase 的 PostgreSQL 連線字串。"
  );
  process.exit(1);
}

// Supabase 連線預設需要 SSL；本機自架 PostgreSQL 若無憑證可將 PGSSLMODE=disable 寫入 .env
const useSSL = process.env.PGSSLMODE !== "disable";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  max: Number(process.env.PG_POOL_MAX || 10),
});

pool.on("error", (err) => {
  console.error("PostgreSQL 連線池發生非預期錯誤：", err);
});

// 統一查詢介面：query(text, params)
async function query(text, params) {
  return pool.query(text, params);
}

// 初始化資料庫結構（啟用 PostGIS、建立資料表、建立第一個管理員帳號）
async function init() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 啟用 PostGIS 擴充功能（Supabase 專案需先在後台的 Database > Extensions 啟用一次，
    // 這裡再呼叫一次是為了本機/自架 PostgreSQL 也能自動啟用）
    await client.query(`CREATE EXTENSION IF NOT EXISTS postgis;`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user', -- 'user' | 'admin'
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // 座標點位（一般使用者新增的地圖標記）
    await client.query(`
      CREATE TABLE IF NOT EXISTS points (
        id SERIAL PRIMARY KEY,
        x DOUBLE PRECISION NOT NULL,
        y DOUBLE PRECISION NOT NULL,
        geom GEOMETRY(Point, 4326),
        name TEXT NOT NULL,
        description TEXT,
        image_path TEXT,
        created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_by_name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS points_geom_gix ON points USING GIST (geom);`
    );

    // 地籍圖（宗地）資料表：由管理員以 ogr2ogr / QGIS 匯入官方地籍圖 shapefile / GeoJSON 後即可搜尋、套疊
    await client.query(`
      CREATE TABLE IF NOT EXISTS parcels (
        id SERIAL PRIMARY KEY,
        county TEXT,               -- 縣市
        town TEXT,                 -- 鄉鎮市區
        section TEXT NOT NULL,     -- 段/小段
        lot_no TEXT NOT NULL,      -- 地號
        area_sqm NUMERIC,          -- 面積（平方公尺，選填，供比對用）
        landuse TEXT,              -- 地目 / 使用分區（選填）
        geom GEOMETRY(MultiPolygon, 4326) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS parcels_geom_gix ON parcels USING GIST (geom);`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS parcels_section_lot_idx ON parcels (section, lot_no);`
    );
    // 供「段小段/地號」模糊搜尋使用的 trigram 索引（加速 ILIKE 查詢）
    await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
    await client.query(
      `CREATE INDEX IF NOT EXISTS parcels_lot_trgm_idx ON parcels USING GIN (lot_no gin_trgm_ops);`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS parcels_section_trgm_idx ON parcels USING GIN (section gin_trgm_ops);`
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // 自動建立第一個管理員帳號：thist / thist000000
  const { rows } = await pool.query("SELECT id FROM users WHERE username = $1", ["thist"]);
  if (rows.length === 0) {
    const hash = bcrypt.hashSync("thist000000", 10);
    await pool.query(
      `INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, 'admin')`,
      ["thist", process.env.ADMIN_EMAIL || "admin@example.com", hash]
    );
    console.log("已自動建立管理員帳號 thist（密碼 thist000000），請盡快登入後變更密碼。");
  }
}

module.exports = { pool, query, init };
