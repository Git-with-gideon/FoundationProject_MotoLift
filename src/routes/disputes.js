const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAdmin, requireAuth } = require("../middleware/auth");
const { sendDisputeAcknowledgement } = require("../services/notifications");

// POST /api/disputes — log a dispute (any authenticated user)
router.post("/", requireAuth, async (req, res) => {
  const { driverId, agreementId, description } = req.body;
  if (!driverId || !description) {
    return res.status(400).json({ error: "driverId and description required" });
  }

  try {
    const dispute = await db.dispute.create({
      data: { driverId, agreementId: agreementId || null, description },
    });

    // Send acknowledgement SMS without blocking
    sendDisputeAcknowledgement(dispute).catch((err) =>
      console.error("[Dispute] SMS ack failed:", err.message),
    );

    res.status(201).json(dispute);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/disputes — list disputes (admin)
router.get("/", requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    const where = req.query.status ? { status: req.query.status } : {};

    const [total, disputes] = await Promise.all([
      db.dispute.count({ where }),
      db.dispute.findMany({
        where,
        skip,
        take: limit,
        include: {
          driver: {
            include: { user: { select: { name: true, phone: true } } },
          },
          agreement: {
            include: {
              motorcycle: {
                select: { plateNumber: true, make: true, model: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    res.json({
      data: disputes,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/disputes/:id/review
router.patch("/:id/review", requireAdmin, async (req, res) => {
  try {
    const existing = await db.dispute.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Dispute not found" });
    if (existing.status !== "OPEN") {
      return res.status(400).json({ error: "Only OPEN disputes can be moved to review" });
    }
    const dispute = await db.dispute.update({
      where: { id: req.params.id },
      data: { status: "UNDER_REVIEW" },
    });
    res.json(dispute);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/disputes/:id/resolve
router.patch("/:id/resolve", requireAdmin, async (req, res) => {
  try {
    const existing = await db.dispute.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Dispute not found" });
    if (existing.status === "RESOLVED") {
      return res.status(400).json({ error: "Dispute is already resolved" });
    }
    const dispute = await db.dispute.update({
      where: { id: req.params.id },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
    res.json(dispute);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
