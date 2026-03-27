const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAdmin } = require("../middleware/auth");
const RW_MOTO_PLATE_REGEX = /^[Rr][A-Za-z] ?\d{3}[A-Za-z]$/;

function normalizeRwMotoPlate(v) {
  return String(v || "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

// GET /api/motorcycles
router.get("/", requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    const [total, motos] = await Promise.all([
      db.motorcycle.count(),
      db.motorcycle.findMany({
        skip,
        take: limit,
        include: {
          owner: { select: { name: true, phone: true } },
          agreements: {
            where: { status: "ACTIVE" },
            include: {
              driver: {
                include: { user: { select: { name: true, phone: true } } },
              },
              escrow: { orderBy: { recordedAt: "desc" }, take: 1 },
            },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    res.json({
      data: motos,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/motorcycles
router.post("/", requireAdmin, async (req, res) => {
  const { plateNumber, make, model, year, totalPrice, ownerId } = req.body;
  const normalizedPlate = normalizeRwMotoPlate(plateNumber);

  if (!normalizedPlate || !make || !model || !year || !totalPrice) {
    return res
      .status(400)
      .json({ error: "plateNumber, make, model, year, totalPrice required" });
  }

  if (!RW_MOTO_PLATE_REGEX.test(normalizedPlate)) {
    return res.status(400).json({
      error:
        "Invalid Rwanda moto plate. Expected format like RC 123X or RC123X.",
    });
  }

  try {
    const moto = await db.motorcycle.create({
      data: {
        plateNumber: normalizedPlate,
        make,
        model,
        year: parseInt(year),
        totalPrice: parseInt(totalPrice),
        ownerId: ownerId || null,
      },
    });
    res.status(201).json(moto);
  } catch (err) {
    if (err.code === "P2002")
      return res.status(409).json({ error: "Plate number already exists" });
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/motorcycles/:id/status
router.patch("/:id/status", requireAdmin, async (req, res) => {
  const valid = ["AVAILABLE", "RENTED", "OWNED", "MAINTENANCE"];
  if (!valid.includes(req.body.status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  try {
    const moto = await db.motorcycle.update({
      where: { id: req.params.id },
      data: { status: req.body.status },
    });
    res.json(moto);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/motorcycles/:id
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const moto = await db.motorcycle.findUnique({
      where: { id: req.params.id },
      include: { agreements: true },
    });
    if (!moto) return res.status(404).json({ error: "Motorcycle not found" });
    if (moto.agreements.some((a) => a.status === "ACTIVE")) {
      return res
        .status(400)
        .json({ error: "Cannot delete a motorcycle with an active agreement" });
    }
    await db.motorcycle.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
