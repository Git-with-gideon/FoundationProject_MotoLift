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

    // Root menu — different for registered vs new users
    if (input === "") {
      if (user?.driver) {
        return cont(
          "Welcome to MotoLift\n" +
            "1. My Status\n" +
            "2. Make Payment\n" +
            "3. Recent Payments\n" +
            "4. Log Dispute\n" +
            "0. Exit",
        );
      } else {
        return cont(
          "Welcome to MotoLift\n" +
            "1. Register as Driver\n" +
            "2. Check Status\n" +
            "0. Exit",
        );
      }
    }

    // Exit
    if (input === "0") return end("Thank you for using MotoLift. Goodbye!");

    // ══════════════════════════════════════════════════════════
    //   UNREGISTERED USER FLOW
    // ══════════════════════════════════════════════════════════
    if (!user?.driver) {
      // ── 1. Register ─────────────────────────────────────────
      if (parts[0] === "1") {
        if (!enrollSessions[sessionId]) {
          enrollSessions[sessionId] = {};
        }
        const s = enrollSessions[sessionId];

        // Step 1: Full name
        if (level === 1) {
          return cont("Enter your full name:");
        }

        // Step 2: Got name, ask national ID
        if (level === 2) {
          s.name = last;
          return cont("Enter your National ID number:");
        }

        // Step 3: Got national ID, ask license
        if (level === 3) {
          s.nationalId = last;
          return cont("Enter your driving license number:");
        }

        // Step 4: Got license, confirm
        if (level === 4) {
          s.licenseNumber = last;
          return cont(
            `Confirm your details:\n` +
              `Name: ${s.name}\n` +
              `NID: ${s.nationalId}\n` +
              `License: ${s.licenseNumber}\n\n` +
              "1. Confirm\n" +
              "0. Cancel",
          );
        }

        // Step 5: Confirm or cancel
        if (level === 5) {
          if (last !== "1") {
            delete enrollSessions[sessionId];
            return end("Registration cancelled.");
          }

          // Create user + driver
          const password = crypto.randomBytes(4).toString("hex");
          const passwordHash = crypto
            .createHash("sha256")
            .update(password)
            .digest("hex");

          try {
            await db.$transaction(async (tx) => {
              const newUser = await tx.user.create({
                data: {
                  phone: phoneNumber,
                  name: s.name,
                  role: "DRIVER",
                  passwordHash,
                },
              });
              await tx.driver.create({
                data: {
                  userId: newUser.id,
                  nationalId: s.nationalId,
                  licenseNumber: s.licenseNumber,
                  status: "PENDING",
                },
              });
            });
          } catch (err) {
            if (err.code === "P2002") {
              delete enrollSessions[sessionId];
              return end(
                "Registration failed: National ID or License already registered.",
              );
            }
            throw err;
          }

          delete enrollSessions[sessionId];
          return end(
            `Registration successful!\n` +
              `Name: ${s.name}\n` +
              `Status: PENDING\n\n` +
              `An admin will review your account and assign you a motorcycle.\n` +
              `You will receive an SMS when activated.`,
          );
        }
      }

      // ── 2. Check Status (unregistered) ──────────────────────
      if (parts[0] === "2") {
        return end(
          "No account found for this number.\nPlease register first (option 1).",
        );
      }

      return end("Invalid option.");
    }

    // ══════════════════════════════════════════════════════════
    //   REGISTERED DRIVER FLOW
    // ══════════════════════════════════════════════════════════

    // ── 1. My Status ──────────────────────────────────────────
    if (parts[0] === "1") {
      const ag = user.driver.agreements[0];
      if (!ag)
        return end(
          `MotoLift Status\nDriver: ${user.name}\nStatus: ${user.driver.status}\n\nNo active agreement yet.\nWait for admin to assign a motorcycle.`,
        );
      const pct = ag.escrow[0]?.ownershipPercentage?.toFixed(1) || "0.0";
      const paid = ag.escrow[0]?.totalPaid || 0;
      const remaining = ag.totalAmount - paid;
      return end(
        `MotoLift Status\n` +
          `Bike: ${ag.motorcycle.make} ${ag.motorcycle.model}\n` +
          `Plate: ${ag.motorcycle.plateNumber}\n` +
          `Ownership: ${pct}%\n` +
          `Paid: ${paid.toLocaleString()} RWF\n` +
          `Remaining: ${remaining.toLocaleString()} RWF\n` +
          `Daily: ${ag.dailyPayment.toLocaleString()} RWF`,
      );
    }

    // ── 2. Make Payment ───────────────────────────────────────
    if (parts[0] === "2") {
      const ag = user.driver.agreements[0];
      if (!ag)
        return end(
          "No active agreement found. Wait for admin to assign a motorcycle.",
        );

      if (level === 1) {
        return cont(
          `Pay ${ag.dailyPayment.toLocaleString()} RWF for ${ag.motorcycle.plateNumber}\n\n` +
            "Select method:\n" +
            "1. MTN MoMo\n" +
            "2. Airtel Money\n" +
            "0. Cancel",
        );
      }

      if (last === "0") return end("Payment cancelled.");

      const methodMap = { 1: "MOMO", 2: "AIRTEL" };
      const method = methodMap[parts[1]];
      if (!method) return end("Invalid option. Payment cancelled.");

      if (level === 2) {
        return cont(
          `Confirm payment of ${ag.dailyPayment.toLocaleString()} RWF via ${parts[1] === "1" ? "MTN MoMo" : "Airtel Money"}?\n1. Confirm\n0. Cancel`,
        );
      }

      if (level === 3) {
        if (last !== "1") return end("Payment cancelled.");

        const externalId = `ussd-${sessionId}-${Date.now()}`;
        const payment = await db.payment.create({
          data: {
            agreementId: ag.id,
            amount: ag.dailyPayment,
            method,
            status: "PENDING",
            momoRef: externalId,
          },
        });

        const { simulated } = await requestToPay({
          amount: ag.dailyPayment,
          phone: phoneNumber,
          externalId,
          note: `MotoLift - ${ag.motorcycle.plateNumber}`,
        }).catch(() => ({ simulated: false }));

        if (simulated) {
          const agg = await db.payment.aggregate({
            where: { agreementId: ag.id, status: "SUCCESS" },
            _sum: { amount: true },
          });
          const totalPaid = (agg._sum.amount || 0) + ag.dailyPayment;
          const ownershipPercentage = Math.min(
            100,
            (totalPaid / ag.totalAmount) * 100,
          );

          await db.payment.update({
            where: { id: payment.id },
            data: { status: "SUCCESS", paidAt: new Date() },
          });
          await db.escrowLedger.create({
            data: { agreementId: ag.id, totalPaid, ownershipPercentage },
          });

          if (ownershipPercentage >= 100) {
            await db.rentalAgreement.update({
              where: { id: ag.id },
              data: { status: "COMPLETED" },
            });
            await db.ownershipRecord.upsert({
              where: { agreementId: ag.id },
              update: { transferredAt: new Date() },
              create: { agreementId: ag.id, transferredAt: new Date() },
            });
          }

          sendPaymentReceipt(payment).catch(() => {});
          return end(
            `Payment confirmed!\n${ag.dailyPayment.toLocaleString()} RWF received.\nOwnership: ${ownershipPercentage.toFixed(1)}%`,
          );
        }

        return end(
          `Payment request sent!\nYou will receive a MoMo prompt shortly.\nRef: ${externalId.slice(-8).toUpperCase()}`,
        );
      }
    }

    // ── 3. Recent Payments ────────────────────────────────────
    if (parts[0] === "3") {
      const ag = user.driver.agreements[0];
      if (!ag) return end("No active agreement found.");

      const payments = ag.payments.slice(0, 5);
      if (!payments.length) return end("No payments recorded yet.");

      const lines = payments
        .map((p) => {
          const d = p.createdAt?.toISOString().slice(0, 10);
          const s = p.status === "SUCCESS" ? "OK" : "FAIL";
          return `${s} ${d} ${p.amount.toLocaleString()} RWF`;
        })
        .join("\n");

      return end(`Recent Payments:\n${lines}`);
    }

    // ── 4. Log Dispute ────────────────────────────────────────
    if (parts[0] === "4") {
      if (level === 1) {
        return cont(
          "Log a dispute:\n" +
            "1. Payment not recorded\n" +
            "2. Wrong amount charged\n" +
            "3. Agreement dispute\n" +
            "4. Other",
        );
      }

      const disputeTypes = {
        1: "Payment not recorded",
        2: "Wrong amount charged",
        3: "Agreement dispute",
        4: "Other issue",
      };
      const description = disputeTypes[last] || "Other issue";

      const ag = user.driver.agreements[0];
      const dispute = await db.dispute.create({
        data: {
          driverId: user.driver.id,
          agreementId: ag?.id || null,
          description,
        },
      });

      const ref = dispute.id.slice(-6).toUpperCase();
      return end(
        `Dispute logged.\nRef: #${ref}\nWe will contact you within 24 hours.`,
      );
    }

    end("Invalid option. Please try again.");
  } catch (err) {
    console.error("[USSD]", err.message);
    end("Service error. Please try again later.");
  }
});

module.exports = router;
