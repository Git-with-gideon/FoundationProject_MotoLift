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


// GET /api/drivers/:id — single driver profile
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const driver = await db.driver.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { name: true, phone: true, createdAt: true } },
        agreements: {
          include: {
            motorcycle: true,
            payments: { orderBy: { createdAt: 'desc' }, take: 20 },
            escrow: { orderBy: { recordedAt: 'desc' }, take: 1 },
          },
        },
      },
    });

    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    res.json(driver);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/drivers/:id/status — update driver status
router.patch('/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body;
  const valid = ['PENDING', 'ACTIVE', 'SUSPENDED'];
  if (!valid.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const driver = await db.driver.update({
      where: { id: req.params.id },
      data: { status },
    });
    res.json(driver);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
