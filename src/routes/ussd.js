const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const db = require("../db");
const { requestToPay } = require("../services/momo");
const { sendPaymentReceipt } = require("../services/notifications");

// In-memory store for multi-step USSD enrollment
const enrollSessions = {};

// POST /ussd — Africa's Talking USSD callback
router.post("/", async (req, res) => {
  const { sessionId, phoneNumber, text } = req.body;
  const input = (text || "").trim();
  const parts = input.split("*");
  const level = parts.length;
  const last = parts[level - 1];

  function end(msg) {
    res.send(`END ${msg}`);
  }
  function cont(msg) {
    res.send(`CON ${msg}`);
  }

  try {
    // Find user by phone
    const user = await db.user.findUnique({
      where: { phone: phoneNumber },
      include: {
        driver: {
          include: {
            agreements: {
              where: { status: "ACTIVE" },
              include: {
                motorcycle: true,
                escrow: { orderBy: { recordedAt: "desc" }, take: 1 },
                payments: { orderBy: { createdAt: "desc" }, take: 5 },
              },
              take: 1,
            },
          },
        },
      },
    });
