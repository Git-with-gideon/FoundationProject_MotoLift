const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAdmin } = require("../middleware/auth");

// GET /api/stats
router.get("/", requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [activeDrivers, activeAgreements, completed, monthPayments] =
      await Promise.all([
        db.driver.count({ where: { status: "ACTIVE" } }),
        db.rentalAgreement.count({ where: { status: "ACTIVE" } }),
        db.rentalAgreement.count({ where: { status: "COMPLETED" } }),
        db.payment.aggregate({
          where: { status: "SUCCESS", paidAt: { gte: startOfMonth } },
          _sum: { amount: true },
        }),
      ]);

    res.json({
      activeDrivers,
      activeAgreements,
      completed,
      collectedThisMonth: monthPayments._sum.amount || 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
