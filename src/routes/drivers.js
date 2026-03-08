const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

// GET /api/drivers — list all drivers with active agreement summary
router.get('/', requireAdmin, async (req, res) => {
  try {
    const drivers = await db.driver.findMany({
      include: {
        user: { select: { name: true, phone: true } },
        agreements: {
          where: { status: 'ACTIVE' },
          include: {
            motorcycle: true,
            escrow: { orderBy: { recordedAt: 'desc' }, take: 1 },
          },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(drivers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
