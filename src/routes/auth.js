const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const db = require("../db");

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

const RW_PHONE_REGEX = /^\+250\d{9}$/;

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ error: "Phone and password required" });
  }
  if (!RW_PHONE_REGEX.test(phone)) {
    return res.status(400).json({ error: "Invalid phone format. Use +250XXXXXXXXX" });
  }

  try {
    const user = await db.user.findUnique({ where: { phone } });
    if (!user || user.passwordHash !== hashPassword(password)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await db.session.create({
      data: { userId: user.id, token, expiresAt },
    });

    res.json({ token, role: user.role, name: user.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/register-owner
router.post("/register-owner", async (req, res) => {
  const { phone, name, password } = req.body;
  if (!phone || !name || !password) {
    return res
      .status(400)
      .json({ error: "Phone, name, and password required" });
  }
  if (!RW_PHONE_REGEX.test(phone)) {
    return res.status(400).json({ error: "Invalid phone format. Use +250XXXXXXXXX" });
  }
  if (password.length < 6) {
    return res
      .status(400)
      .json({ error: "Password must be at least 6 characters" });
  }

  try {
    const existing = await db.user.findUnique({ where: { phone } });
    if (existing)
      return res.status(409).json({ error: "Phone number already registered" });

    const user = await db.user.create({
      data: {
        phone,
        name,
        role: "OWNER",
        passwordHash: hashPassword(password),
      },
    });

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.session.create({ data: { userId: user.id, token, expiresAt } });

    res.status(201).json({ token, role: user.role, name: user.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/logout
router.post("/logout", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (token) {
    await db.session.deleteMany({ where: { token } }).catch(() => {});
  }
  res.json({ ok: true });
});

module.exports = router;
