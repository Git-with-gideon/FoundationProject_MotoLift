const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAdmin } = require("../middleware/auth");
const { sendSMS } = require("../services/sms");

// GET /api/notifications — list all notifications
router.get("/", requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      db.notification.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: { user: { select: { name: true, phone: true } } },
      }),
      db.notification.count(),
    ]);

    res.json({ notifications, total, page });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/notifications/send — manually send SMS to a user
router.post("/send", requireAdmin, async (req, res) => {
  const { userId, message } = req.body;
  if (!userId || !message) {
    return res.status(400).json({ error: "userId and message required" });
  }

  try {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const notif = await db.notification.create({
      data: { userId, message, channel: "SMS" },
    });

    await sendSMS(user.phone, message);

    const updated = await db.notification.update({
      where: { id: notif.id },
      data: { sent: true, sentAt: new Date() },
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send notification" });
  }
});

module.exports = router;
