const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAdmin, requireAuth } = require("../middleware/auth");
const { requestToPay, getPaymentStatus } = require("../services/momo");
const { sendPaymentReceipt } = require("../services/notifications");

// POST /api/payments/initiate — create a payment + trigger MoMo debit
router.post("/initiate", requireAuth, async (req, res) => {
  const { agreementId, method } = req.body;
  if (!agreementId)
    return res.status(400).json({ error: "agreementId required" });

  try {
    const agreement = await db.rentalAgreement.findUnique({
      where: { id: agreementId },
      include: {
        driver: { include: { user: true } },
        motorcycle: true,
      },
    });
    if (!agreement)
      return res.status(404).json({ error: "Agreement not found" });
    if (agreement.status !== "ACTIVE")
      return res.status(400).json({ error: "Agreement is not active" });

    const paymentMethod = method || "MOMO";
    const externalId = `ml-${Date.now()}`;

    // Create pending payment record
    const payment = await db.payment.create({
      data: {
        agreementId,
        amount: agreement.dailyPayment,
        method: paymentMethod,
        status: "PENDING",
        momoRef: externalId,
      },
    });

    if (paymentMethod === "MOMO" || paymentMethod === "AIRTEL") {
      const { referenceId, simulated } = await requestToPay({
        amount: agreement.dailyPayment,
        phone: agreement.driver.user.phone,
        externalId,
        note: `MotoLift payment - ${agreement.motorcycle.plateNumber}`,
      });

      if (simulated) {
        // In sandbox/no-credentials mode: auto-confirm the payment
        await confirmPayment(
          payment.id,
          agreementId,
          agreement.dailyPayment,
          agreement.totalAmount,
        );
        const updated = await db.payment.findUnique({
          where: { id: payment.id },
        });
        return res.json(updated);
      }

      // Update with real MoMo reference
      await db.payment.update({
        where: { id: payment.id },
        data: { momoRef: referenceId },
      });
    } else {
      // CASH — confirm immediately
      await confirmPayment(
        payment.id,
        agreementId,
        agreement.dailyPayment,
        agreement.totalAmount,
      );
    }

    const updated = await db.payment.findUnique({ where: { id: payment.id } });
    res.status(201).json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/payments/callback — MoMo webhook to confirm payment
router.post("/callback", async (req, res) => {
  try {
    const { referenceId, status } = req.body;
    const payment = await db.payment.findFirst({
      where: { momoRef: referenceId },
    });
    if (!payment) return res.status(404).json({ error: "Payment not found" });

    if (status === "SUCCESSFUL") {
      const agreement = await db.rentalAgreement.findUnique({
        where: { id: payment.agreementId },
      });
      await confirmPayment(
        payment.id,
        payment.agreementId,
        payment.amount,
        agreement.totalAmount,
      );
    } else {
      await db.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED" },
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/payments — list payments (admin)
// GET /api/payments — list payments (admin)
router.get("/", requireAdmin, async (req, res) => {
  try {
    const { status, agreementId } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    const where = {};
    if (status) where.status = status;
    if (agreementId) where.agreementId = agreementId;

    const [total, payments] = await Promise.all([
      db.payment.count({ where }),
      db.payment.findMany({
        where,
        skip,
        take: limit,
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
      }),
    ]);

    res.json({
      data: payments,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/payments/check/:momoRef — poll MoMo status and update
router.get("/check/:momoRef", requireAuth, async (req, res) => {
  try {
    const payment = await db.payment.findFirst({
      where: { momoRef: req.params.momoRef },
    });
    if (!payment) return res.status(404).json({ error: "Payment not found" });

    const momoStatus = await getPaymentStatus(payment.momoRef);
    if (momoStatus.status === "SUCCESSFUL" && payment.status !== "SUCCESS") {
      const agreement = await db.rentalAgreement.findUnique({
        where: { id: payment.agreementId },
      });
      await confirmPayment(
        payment.id,
        payment.agreementId,
        payment.amount,
        agreement.totalAmount,
      );
    } else if (momoStatus.status === "FAILED" && payment.status !== "FAILED") {
      await db.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED" },
      });
    }

    const updated = await db.payment.findUnique({ where: { id: payment.id } });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});
