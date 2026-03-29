const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAdmin } = require("../middleware/auth");
const { sendStatusChangeNotification } = require("../services/notifications");
const RW_LICENSE_REGEX = /^(RW-DL-\d{4,10}|[A-Z]{2}\d{3}[A-Z])$/;

// POST /api/drivers — register a new driver + create agreement
router.post("/", requireAdmin, async (req, res) => {
  const {
    phone,
    name,
    nationalId,
    licenseNumber,
    motorcycleId,
    dailyPayment,
    totalAmount,
    expectedEndDate,
  } = req.body;
  if (
    !phone ||
    !nationalId ||
    !licenseNumber ||
    !motorcycleId ||
    !dailyPayment ||
    !totalAmount
  ) {
    return res.status(400).json({
      error:
        "phone, nationalId, licenseNumber, motorcycleId, dailyPayment, totalAmount required",
    });
  }

  const normalizedLicense = String(licenseNumber || "")
    .toUpperCase()
    .trim();
  if (!RW_LICENSE_REGEX.test(normalizedLicense)) {
    return res
      .status(400)
      .json({ error: "Invalid license. Use format:RD344F" });
  }

  const parsedDaily = parseInt(dailyPayment);
  const parsedTotal = parseInt(totalAmount);
  if (isNaN(parsedDaily) || parsedDaily <= 0) {
    return res.status(400).json({ error: "dailyPayment must be a positive number" });
  }
  if (isNaN(parsedTotal) || parsedTotal <= 0) {
    return res.status(400).json({ error: "totalAmount must be a positive number" });
  }
  if (parsedDaily > parsedTotal) {
    return res.status(400).json({ error: "dailyPayment cannot exceed totalAmount" });
  }

  try {
    const crypto = require("crypto");
    const defaultPassword = crypto.randomBytes(4).toString("hex");
    const passwordHash = crypto
      .createHash("sha256")
      .update(defaultPassword)
      .digest("hex");

    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { phone, name: name || phone, role: "DRIVER", passwordHash },
      });
      const driver = await tx.driver.create({
        data: {
          userId: user.id,
          nationalId,
          licenseNumber: normalizedLicense,
          status: "ACTIVE",
        },
      });
      const agreement = await tx.rentalAgreement.create({
        data: {
          driverId: driver.id,
          motorcycleId,
          dailyPayment: parseInt(dailyPayment),
          totalAmount: parseInt(totalAmount),
          expectedEndDate: expectedEndDate
            ? new Date(expectedEndDate)
            : new Date(Date.now() + 540 * 24 * 60 * 60 * 1000),
        },
      });
      await tx.motorcycle.update({
        where: { id: motorcycleId },
        data: { status: "RENTED" },
      });
      return { user, driver, agreement, tempPassword: defaultPassword };
    });

    res.status(201).json(result);
  } catch (err) {
    if (err.code === "P2002")
      return res
        .status(409)
        .json({ error: "Phone, national ID, or license already exists" });
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/drivers — list all drivers with active agreement summary
// GET /api/drivers — list all drivers with active agreement summary
router.get("/", requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    const [total, drivers] = await Promise.all([
      db.driver.count(),
      db.driver.findMany({
        skip,
        take: limit,
        include: {
          user: { select: { name: true, phone: true } },
          agreements: {
            where: { status: "ACTIVE" },
            include: {
              motorcycle: true,
              escrow: { orderBy: { recordedAt: "desc" }, take: 1 },
            },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    res.json({
      data: drivers,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/drivers/:id — single driver profile
router.get("/:id", requireAdmin, async (req, res) => {
  try {
    const driver = await db.driver.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { name: true, phone: true, createdAt: true } },
        agreements: {
          include: {
            motorcycle: true,
            payments: { orderBy: { createdAt: "desc" }, take: 20 },
            escrow: { orderBy: { recordedAt: "desc" }, take: 1 },
          },
        },
      },
    });

    if (!driver) return res.status(404).json({ error: "Driver not found" });
    res.json(driver);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/drivers/:id/status — update driver status
router.patch("/:id/status", requireAdmin, async (req, res) => {
  const { status } = req.body;
  const valid = ["PENDING", "ACTIVE", "SUSPENDED"];
  if (!valid.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const driver = await db.driver.update({
      where: { id: req.params.id },
      data: { status },
      include: { user: true },
    });

    sendStatusChangeNotification(driver, status).catch((err) =>
      console.error("[Notify] Status SMS failed:", err.message),
    );

    res.json(driver);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/drivers/:id
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const driver = await db.driver.findUnique({
      where: { id: req.params.id },
      include: { agreements: true, user: true },
    });
    if (!driver) return res.status(404).json({ error: "Driver not found" });
    if (driver.agreements.some((a) => a.status === "ACTIVE")) {
      return res
        .status(400)
        .json({ error: "Cannot delete a driver with an active agreement" });
    }
    await db.driver.delete({ where: { id: req.params.id } });
    await db.user.delete({ where: { id: driver.userId } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
