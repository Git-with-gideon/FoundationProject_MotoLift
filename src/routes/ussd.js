const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const db = require("../db");
const { requestToPay } = require("../services/momo");
const { sendPaymentReceipt } = require("../services/notifications");

// In-memory store for multi-step USSD enrollment
const enrollSessions = {};

// Clean up abandoned sessions older than 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const sid of Object.keys(enrollSessions)) {
    if (now - (enrollSessions[sid]._ts || 0) > 10 * 60 * 1000) {
      delete enrollSessions[sid];
    }
  }
}, 5 * 60 * 1000);

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

  // "00" from any submenu = back to main menu
  if (last === "00" && level > 1) {
    return cont(await mainMenu(phoneNumber));
  }

  try {
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

    // ── Root menu ─────────────────────────────────────────────
    if (input === "") {
      if (user?.driver) {
        const ag = user.driver.agreements[0];
        if (ag) {
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
              `Driver: ${user.name}\n` +
              `Status: ${user.driver.status}\n\n` +
              "1. Browse Available Bikes\n" +
              "2. My Status\n" +
              "0. Exit",
          );
        }
      } else {
        return cont(
          "Welcome to MotoLift\n" +
            "1. Register as Driver\n" +
            "2. Check Status\n" +
            "0. Exit",
        );
      }
    }

    if (input === "0") return end("Thank you for using MotoLift. Goodbye!");

    // ══════════════════════════════════════════════════════════
    //   UNREGISTERED USER FLOW
    // ══════════════════════════════════════════════════════════
    if (!user?.driver) {
      if (parts[0] === "1") {
        if (!enrollSessions[sessionId]) {
          enrollSessions[sessionId] = { _ts: Date.now() };
        }
        const s = enrollSessions[sessionId];

        if (level === 1) {
          return cont("Enter your full name:\n\n00. Main menu");
        }

        if (level === 2) {
          if (!last || last.length < 3 || last.length > 100) {
            return end("Invalid name. Must be 3-100 characters.");
          }
          s.name = last.trim();
          return cont("Enter your National ID number:\n\n00. Main menu");
        }

        if (level === 3) {
          if (!last || last.length < 10 || last.length > 20) {
            return end("Invalid National ID. Must be 10-20 characters.");
          }
          s.nationalId = last.trim();
          return cont("Enter your driving license number:\n\n00. Main menu");
        }

        if (level === 4) {
          s.licenseNumber = last.trim();
          return cont(
            `Confirm your details:\n` +
              `Name: ${s.name}\n` +
              `NID: ${s.nationalId}\n` +
              `License: ${s.licenseNumber}\n\n` +
              "1. Confirm\n" +
              "0. Cancel",
          );
        }

        if (level === 5) {
          if (last !== "1") {
            delete enrollSessions[sessionId];
            return end("Registration cancelled.");
          }

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
              `Dial *384# again to browse\n` +
              `available bikes and select one.`,
          );
        }
      }

      if (parts[0] === "2") {
        return end(
          "No account found for this number.\nPlease register first (option 1).",
        );
      }

      return end("Invalid option.");
    }

    // ══════════════════════════════════════════════════════════
    //   REGISTERED DRIVER — NO AGREEMENT (browse bikes)
    // ══════════════════════════════════════════════════════════
    const ag = user.driver.agreements[0];

    if (!ag) {
      if (parts[0] === "1") {
        if (level === 1) {
          const bikes = await db.motorcycle.findMany({
            where: { status: "AVAILABLE" },
            include: { owner: { select: { name: true } } },
            take: 7,
          });

          if (bikes.length === 0) {
            return end("No bikes available right now.\nCheck back later.");
          }

          if (!enrollSessions[sessionId]) enrollSessions[sessionId] = { _ts: Date.now() };
          enrollSessions[sessionId].bikes = bikes;

          let menu = "Available Bikes:\n\n";
          bikes.forEach((b, i) => {
            const daily = Math.ceil(b.totalPrice / 540);
            menu += `${i + 1}. ${b.make} ${b.model} (${b.plateNumber})\n`;
            menu += `   ${daily.toLocaleString()} RWF/day\n`;
          });
          menu += "\n0. Back";

          return cont(menu);
        }

        if (level === 2) {
          if (last === "0") {
            return cont(
              "Welcome to MotoLift\n" +
                `Driver: ${user.name}\n` +
                `Status: ${user.driver.status}\n\n` +
                "1. Browse Available Bikes\n" +
                "2. My Status\n" +
                "0. Exit",
            );
          }

          const s = enrollSessions[sessionId];
          if (!s?.bikes) return end("Session expired. Dial *384# again.");

          const idx = parseInt(last) - 1;
          if (isNaN(idx) || idx < 0 || idx >= s.bikes.length) {
            return end("Invalid selection. Dial *384# to try again.");
          }

          const bike = s.bikes[idx];
          const daily = Math.ceil(bike.totalPrice / 540);
          s.selectedBike = bike;
          s.dailyPayment = daily;

          return cont(
            `Selected Bike:\n` +
              `${bike.make} ${bike.model}\n` +
              `Plate: ${bike.plateNumber}\n` +
              `Price: ${bike.totalPrice.toLocaleString()} RWF\n` +
              `Daily: ${daily.toLocaleString()} RWF\n` +
              `Duration: 18 months\n\n` +
              `1. Confirm & Start\n` +
              `0. Back to bikes`,
          );
        }

        if (level === 3) {
          if (last === "0") {
            // Go back to bike list
            const bikes = await db.motorcycle.findMany({
              where: { status: "AVAILABLE" },
              take: 7,
            });
            if (!enrollSessions[sessionId]) enrollSessions[sessionId] = { _ts: Date.now() };
            enrollSessions[sessionId].bikes = bikes;

            let menu = "Available Bikes:\n\n";
            bikes.forEach((b, i) => {
              const daily = Math.ceil(b.totalPrice / 540);
              menu += `${i + 1}. ${b.make} ${b.model} (${b.plateNumber})\n`;
              menu += `   ${daily.toLocaleString()} RWF/day\n`;
            });
            menu += "\n0. Back";
            return cont(menu);
          }

          if (last !== "1") {
            delete enrollSessions[sessionId];
            return end("Selection cancelled.");
          }

          const s = enrollSessions[sessionId];
          if (!s?.selectedBike) return end("Session expired. Dial *384# again.");

          const bike = s.selectedBike;
          const daily = s.dailyPayment;

          try {
            await db.$transaction(async (tx) => {
              await tx.rentalAgreement.create({
                data: {
                  driverId: user.driver.id,
                  motorcycleId: bike.id,
                  dailyPayment: daily,
                  totalAmount: bike.totalPrice,
                  expectedEndDate: new Date(Date.now() + 540 * 24 * 60 * 60 * 1000),
                },
              });
              await tx.motorcycle.update({
                where: { id: bike.id },
                data: { status: "RENTED" },
              });
              await tx.driver.update({
                where: { id: user.driver.id },
                data: { status: "ACTIVE" },
              });
            });
          } catch (err) {
            delete enrollSessions[sessionId];
            return end("Error selecting bike. It may have been taken. Try again.");
          }

          delete enrollSessions[sessionId];
          return end(
            `Bike assigned!\n\n` +
              `${bike.make} ${bike.model}\n` +
              `Plate: ${bike.plateNumber}\n` +
              `Daily payment: ${daily.toLocaleString()} RWF\n` +
              `Status: ACTIVE\n\n` +
              `Dial *384# to make your\n` +
              `first payment.`,
          );
        }
      }

      if (parts[0] === "2") {
        return end(
          `MotoLift Status\n` +
            `Driver: ${user.name}\n` +
            `Status: ${user.driver.status}\n\n` +
            `No bike assigned yet.\n` +
            `Select option 1 to browse\n` +
            `available bikes.`,
        );
      }

      return end("Invalid option.");
    }

    // ══════════════════════════════════════════════════════════
    //   ACTIVE DRIVER WITH AGREEMENT
    // ══════════════════════════════════════════════════════════

    // ── 1. My Status ──────────────────────────────────────────
    if (parts[0] === "1") {
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
      if (level === 1) {
        return cont(
          `Pay ${ag.dailyPayment.toLocaleString()} RWF for ${ag.motorcycle.plateNumber}\n\n` +
            "Select method:\n" +
            "1. MTN MoMo\n" +
            "2. Airtel Money\n" +
            "0. Back",
        );
      }

      if (last === "0" && level === 2) {
        return cont(
          "Welcome to MotoLift\n" +
            "1. My Status\n" +
            "2. Make Payment\n" +
            "3. Recent Payments\n" +
            "4. Log Dispute\n" +
            "0. Exit",
        );
      }

      const methodMap = { 1: "MOMO", 2: "AIRTEL" };
      const method = methodMap[parts[1]];
      if (!method) return end("Invalid option. Payment cancelled.");

      if (level === 2) {
        return cont(
          `Confirm payment of ${ag.dailyPayment.toLocaleString()} RWF via ${parts[1] === "1" ? "MTN MoMo" : "Airtel Money"}?\n\n1. Confirm\n0. Back`,
        );
      }

      if (level === 3) {
        if (last === "0") {
          return cont(
            `Pay ${ag.dailyPayment.toLocaleString()} RWF for ${ag.motorcycle.plateNumber}\n\n` +
              "Select method:\n" +
              "1. MTN MoMo\n" +
              "2. Airtel Money\n" +
              "0. Back",
          );
        }

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
            "4. Other\n" +
            "0. Back",
        );
      }

      if (last === "0" && level === 2) {
        return cont(
          "Welcome to MotoLift\n" +
            "1. My Status\n" +
            "2. Make Payment\n" +
            "3. Recent Payments\n" +
            "4. Log Dispute\n" +
            "0. Exit",
        );
      }

      const disputeTypes = {
        1: "Payment not recorded",
        2: "Wrong amount charged",
        3: "Agreement dispute",
        4: "Other issue",
      };
      const description = disputeTypes[last] || "Other issue";

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

// Helper to build main menu for back navigation
async function mainMenu(phoneNumber) {
  const user = await db.user.findUnique({
    where: { phone: phoneNumber },
    include: { driver: { include: { agreements: { where: { status: "ACTIVE" }, take: 1 } } } },
  });

  if (user?.driver?.agreements?.[0]) {
    return "Welcome to MotoLift\n1. My Status\n2. Make Payment\n3. Recent Payments\n4. Log Dispute\n0. Exit";
  }
  if (user?.driver) {
    return `Welcome to MotoLift\nDriver: ${user.name}\nStatus: ${user.driver.status}\n\n1. Browse Available Bikes\n2. My Status\n0. Exit`;
  }
  return "Welcome to MotoLift\n1. Register as Driver\n2. Check Status\n0. Exit";
}

module.exports = router;
