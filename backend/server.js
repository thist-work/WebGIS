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

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

const io = new Server(server, {
  cors: {
    origin: FRONTEND_ORIGIN,
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});
app.set("io", io);

app.use(cors({ origin: FRONTEND_ORIGIN }));
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
