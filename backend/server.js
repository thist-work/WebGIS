require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const { init } = require("./db");

const authRoutes = require("./routes/auth");
const pointsRoutes = require("./routes/points");
const parcelsRoutes = require("./routes/parcels");

const app = express();
const server = http.createServer(app);

// 支援以逗號分隔設定多個允許來源（例如正式站網域 + Vercel 預覽網址），
// 新增/修改/刪除/密碼變更觸發 CORS 預檢（preflight）請求，瀏覽器可擋下
const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true; // 例如伺服器對伺服器、Postman 等無 Origin 的請求
  if (FRONTEND_ORIGINS.includes(origin)) return true;
  try {
    // 允許同一個 Vercel 專案底下的所有預覽部署網址（*.vercel.app）
    if (/\.vercel\.app$/.test(new URL(origin).hostname)) return true;
  } catch {
    return false;
  }
  return false;
}

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      callback(null, isAllowedOrigin(origin));
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});
app.set("io", io);

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) callback(null, true);
      else callback(new Error("Not allowed by CORS"));
    },
  })
);
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/points", pointsRoutes);
app.use("/api/parcels", parcelsRoutes);

io.on("connection", (socket) => {
  console.log("使用者連線 socket:", socket.id);
  socket.on("disconnect", () => {
    console.log("使用者離線 socket:", socket.id);
  });
});

const PORT = process.env.PORT || 4000;

// 先初始化 PostgreSQL / PostGIS 結構，成功後才開始接受連線
init()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`後端伺服器已啟動：http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ 資料庫初始化失敗，伺服器未啟動：", err);
    process.exit(1);
  });
