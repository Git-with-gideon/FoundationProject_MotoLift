const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { sendStatusChangeNotification } = require("../services/notifications");

function requireOwner(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== "OWNER" && req.user.role !== "ADMIN") {
      return res.status(403).json({ error: "Owner access required" });
    }
    next();
  });
}

const RW_MOTO_PLATE_REGEX = /^[Rr][A-Za-z] ?\d{3}[A-Za-z]$/;

// POST /api/owner/motorcycles — owner adds a bike to their fleet
router.post("/motorcycles", requireOwner, async (req, res) => {
  const { plateNumber, make, model, year, totalPrice } = req.body;
  if (!plateNumber || !make || !model || !year || !totalPrice) {
    return res
      .status(400)
      .json({ error: "plateNumber, make, model, year, totalPrice required" });
  }
  const normalizedPlate = String(plateNumber).toUpperCase().trim();
  if (!RW_MOTO_PLATE_REGEX.test(normalizedPlate)) {
    return res.status(400).json({ error: "Invalid Rwanda plate format. Expected: RC 123X" });
  }
  const parsedYear = parseInt(year);
  const parsedPrice = parseInt(totalPrice);
  if (isNaN(parsedYear) || parsedYear < 2000 || parsedYear > new Date().getFullYear() + 1) {
    return res.status(400).json({ error: "Invalid year" });
  }
  if (isNaN(parsedPrice) || parsedPrice <= 0) {
    return res.status(400).json({ error: "totalPrice must be a positive number" });
  }
  try {
    const moto = await db.motorcycle.create({
      data: {
        plateNumber: normalizedPlate,
        make,
        model,
        year: parsedYear,
        totalPrice: parsedPrice,
        ownerId: req.user.id,
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

// DELETE /api/owner/motorcycles/:id
router.delete("/motorcycles/:id", requireOwner, async (req, res) => {
  try {
    const moto = await db.motorcycle.findUnique({
      where: { id: req.params.id },
      include: { agreements: true },
    });
    if (!moto) return res.status(404).json({ error: "Motorcycle not found" });
    if (moto.ownerId !== req.user.id && req.user.role !== "ADMIN")
      return res.status(403).json({ error: "Not your motorcycle" });
    if (moto.agreements.some((a) => a.status === "ACTIVE"))
      return res
        .status(400)
        .json({ error: "Cannot delete — has active agreement" });
    await db.motorcycle.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/owner/pending-drivers — PENDING drivers with no active agreement
router.get("/pending-drivers", requireOwner, async (req, res) => {
  try {
    const drivers = await db.driver.findMany({
      where: { status: "PENDING", agreements: { none: { status: "ACTIVE" } } },
      include: { user: { select: { name: true, phone: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(drivers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/owner/assign-driver — assign pending driver to owner's motorcycle
router.post("/assign-driver", requireOwner, async (req, res) => {
  const { driverId, motorcycleId, dailyPayment, totalAmount } = req.body;
  if (!driverId || !motorcycleId || !dailyPayment || !totalAmount) {
    return res
      .status(400)
      .json({
        error: "driverId, motorcycleId, dailyPayment, totalAmount required",
      });
  }
  const parsedDaily = parseInt(dailyPayment);
  const parsedTotal = parseInt(totalAmount);
  if (isNaN(parsedDaily) || parsedDaily <= 0 || isNaN(parsedTotal) || parsedTotal <= 0) {
    return res.status(400).json({ error: "Payment amounts must be positive numbers" });
  }
  if (parsedDaily > parsedTotal) {
    return res.status(400).json({ error: "dailyPayment cannot exceed totalAmount" });
  }
  try {
    const result = await db.$transaction(async (tx) => {
      const driver = await tx.driver.findUnique({
        where: { id: driverId },
        include: { user: true },
      });
      if (!driver) throw new Error("Driver not found");
      if (driver.status !== "PENDING") throw new Error("Driver is not PENDING");

      const moto = await tx.motorcycle.findUnique({
        where: { id: motorcycleId },
      });
      if (!moto) throw new Error("Motorcycle not found");
      if (moto.ownerId !== req.user.id && req.user.role !== "ADMIN")
        throw new Error("Not your motorcycle");
      if (moto.status !== "AVAILABLE")
        throw new Error("Motorcycle is not available");

      const agreement = await tx.rentalAgreement.create({
        data: {
          driverId,
          motorcycleId,
          dailyPayment: parseInt(dailyPayment),
          totalAmount: parseInt(totalAmount),
          expectedEndDate: new Date(Date.now() + 540 * 24 * 60 * 60 * 1000),
        },
      });
      await tx.motorcycle.update({
        where: { id: motorcycleId },
        data: { status: "RENTED" },
      });
      const updated = await tx.driver.update({
        where: { id: driverId },
        data: { status: "ACTIVE" },
        include: { user: true },
      });
      return { agreement, driver: updated };
    });

    sendStatusChangeNotification(result.driver, "ACTIVE").catch((err) =>
      console.error("[Notify] Assignment SMS failed:", err.message),
    );

    res.status(201).json(result.agreement);
  } catch (err) {
    if (err.message && !err.code)
      return res.status(400).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/owner/summary
router.get("/summary", requireOwner, async (req, res) => {
  try {
    const motorcycles = await db.motorcycle.findMany({
      where: req.user.role === "ADMIN" ? {} : { ownerId: req.user.id },
      include: {
        agreements: {
          include: {
            driver: {
              include: { user: { select: { name: true, phone: true } } },
            },
            payments: {
              where: { status: "SUCCESS" },
              select: { amount: true },
            },
            escrow: { orderBy: { recordedAt: "desc" }, take: 1 },
          },
        },
      },
    });

    const summary = motorcycles.map((moto) => {
      const ag = moto.agreements.find((a) => a.status === "ACTIVE");
      const totalCollected = moto.agreements
        .flatMap((a) => a.payments)
        .reduce((s, p) => s + p.amount, 0);
      return {
        id: moto.id,
        plateNumber: moto.plateNumber,
        make: moto.make,
        model: moto.model,
        year: moto.year,
        totalPrice: moto.totalPrice,
        status: moto.status,
        totalCollected,
        remaining: moto.totalPrice - totalCollected,
        agreementId: ag?.id || null,
        driver: ag
          ? {
              name: ag.driver.user.name || ag.driver.user.phone,
              phone: ag.driver.user.phone,
              ownershipPct: ag.escrow[0]?.ownershipPercentage || 0,
              dailyPayment: ag.dailyPayment,
            }
          : null,
      };
    });
    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/owner/payments
router.get("/payments", requireOwner, async (req, res) => {
  try {
    const payments = await db.payment.findMany({
      where: {
        agreement: {
          motorcycle: req.user.role === "ADMIN" ? {} : { ownerId: req.user.id },
        },
      },
      include: {
        agreement: {
          include: {
            motorcycle: {
              select: { plateNumber: true, make: true, model: true },
            },
            driver: {
              include: { user: { select: { name: true, phone: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(payments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
