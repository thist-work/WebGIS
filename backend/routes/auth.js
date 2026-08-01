const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// 註冊新帳號（一律為一般使用者）
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "請輸入帳號與密碼" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "密碼至少需 6 碼" });
    }
    const exists = await query("SELECT id FROM users WHERE username = $1", [username]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: "此帳號已被使用" });
    }
    const hash = bcrypt.hashSync(password, 10);
    const inserted = await query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, 'user') RETURNING id, username, role`,
      [username, email || null, hash]
    );
    const user = inserted.rows[0];
    const token = signToken(user);
    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "註冊失敗，請稍後再試" });
  }
});

// 登入
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "請輸入帳號與密碼" });
    }
    const { rows } = await query("SELECT * FROM users WHERE username = $1", [username]);
    const user = rows[0];
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: "帳號或密碼錯誤" });
    }
    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role, email: user.email },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "登入失敗，請稍後再試" });
  }
});

// 變更密碼（需登入）
router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "請輸入舊密碼與新密碼" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "新密碼至少需 6 碼" });
    }
    const { rows } = await query("SELECT * FROM users WHERE id = $1", [req.user.id]);
    const user = rows[0];
    if (!user || !bcrypt.compareSync(oldPassword, user.password_hash)) {
      return res.status(401).json({ error: "舊密碼不正確" });
    }
    const hash = bcrypt.hashSync(newPassword, 10);
    await query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "變更密碼失敗，請稍後再試" });
  }
});

// 取得目前登入者資訊
router.get("/me", requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      "SELECT id, username, email, role FROM users WHERE id = $1",
      [req.user.id]
    );
    res.json({ user: rows[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "查詢失敗" });
  }
});

module.exports = router;
