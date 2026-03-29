const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");

const db = new PrismaClient();
const hash = (pw) => crypto.createHash("sha256").update(pw).digest("hex");

// Deterministic random from string seed
function rand(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return Math.abs(h % 10000) / 10000;
}

// ── REALISTIC PILOT CONFIG ──────────────────────────────────────────

const PILOT_START = new Date("2026-01-12T00:00:00Z"); // mid-January start
const PILOT_DAYS = 77; // ~2.5 months through late March

const OWNERS = [
  { phone: "+250788100001", name: "Jean-Claude Uwimana", password: "owner123" },
  { phone: "+250788100002", name: "Diane Mukamana", password: "owner123" },
  { phone: "+250788100003", name: "Thomas Habiyambere", password: "owner123" },
  { phone: "+250788100004", name: "Alice Ingabire", password: "owner123" },
];

// Each driver has individual reliability, join week, and payment habits
const DRIVERS = [
  { name: "Emmanuel Habimana",      phone: "+250789100001", nid: "1199880012345601", lic: "RD344F", plate: "RA 234B", make: "Bajaj",  model: "Boxer 150",  year: 2024, ownerIdx: 0, daily: 2222, total: 1200000, joinDay: 0,  reliability: 0.96 },
  { name: "Patrick Niyonzima",      phone: "+250789100002", nid: "1199880012345602", lic: "PN567G", plate: "RB 567C", make: "TVS",    model: "HLX 150",    year: 2024, ownerIdx: 0, daily: 1852, total: 1000000, joinDay: 0,  reliability: 0.91 },
  { name: "Jean-Pierre Mugabo",     phone: "+250789100003", nid: "1199880012345603", lic: "JM891H", plate: "RA 891D", make: "Bajaj",  model: "Boxer 150",  year: 2023, ownerIdx: 1, daily: 2222, total: 1200000, joinDay: 3,  reliability: 0.88 },
  { name: "Innocent Nsengiyumva",   phone: "+250789100004", nid: "1199880012345604", lic: "IN123J", plate: "RC 123E", make: "Honda",  model: "CG125",      year: 2023, ownerIdx: 1, daily: 1759, total: 950000,  joinDay: 3,  reliability: 0.93 },
  { name: "Eric Ndayisaba",         phone: "+250789100005", nid: "1199880012345605", lic: "EN456K", plate: "RA 456F", make: "TVS",    model: "HLX 150",    year: 2024, ownerIdx: 0, daily: 1852, total: 1000000, joinDay: 7,  reliability: 0.85 },
  { name: "Claude Bizimana",        phone: "+250789100006", nid: "1199880012345606", lic: "CB789L", plate: "RB 789G", make: "Bajaj",  model: "Boxer 150",  year: 2024, ownerIdx: 2, daily: 2222, total: 1200000, joinDay: 7,  reliability: 0.94 },
  { name: "Olivier Hakizimana",     phone: "+250789100007", nid: "1199880012345607", lic: "OH012M", plate: "RC 012H", make: "TVS",    model: "HLX 150",    year: 2023, ownerIdx: 2, daily: 1852, total: 1000000, joinDay: 10, reliability: 0.78 },
  { name: "Samuel Iradukunda",      phone: "+250789100008", nid: "1199880012345608", lic: "SI345N", plate: "RA 345I", make: "Bajaj",  model: "Boxer 150",  year: 2024, ownerIdx: 1, daily: 2222, total: 1200000, joinDay: 14, reliability: 0.95 },
  { name: "David Uwamahoro",        phone: "+250789100009", nid: "1199880012345609", lic: "DU678P", plate: "RB 678J", make: "Honda",  model: "CG125",      year: 2024, ownerIdx: 2, daily: 1759, total: 950000,  joinDay: 14, reliability: 0.89 },
  { name: "Gilbert Nshimiyimana",   phone: "+250789100010", nid: "1199880012345610", lic: "GN901Q", plate: "RC 901K", make: "TVS",    model: "HLX 150",    year: 2024, ownerIdx: 3, daily: 1852, total: 1000000, joinDay: 21, reliability: 0.92 },
  { name: "Fabien Tuyishime",       phone: "+250789100011", nid: "1199880012345611", lic: "FT234R", plate: "RA 234L", make: "Bajaj",  model: "Boxer 150",  year: 2023, ownerIdx: 3, daily: 2222, total: 1200000, joinDay: 21, reliability: 0.82 },
  { name: "Damascene Mugisha",      phone: "+250789100012", nid: "1199880012345612", lic: "DM567S", plate: "RB 567M", make: "Bajaj",  model: "Boxer 150",  year: 2024, ownerIdx: 0, daily: 2222, total: 1200000, joinDay: 28, reliability: 0.90 },
  { name: "Bosco Niyibizi",         phone: "+250789100013", nid: "1199880012345613", lic: "BN890T", plate: "RC 890N", make: "TVS",    model: "HLX 150",    year: 2023, ownerIdx: 1, daily: 1852, total: 1000000, joinDay: 28, reliability: 0.76 },
  { name: "Theogene Ishimwe",       phone: "+250789100014", nid: "1199880012345614", lic: "TI123U", plate: "RA 123O", make: "Honda",  model: "CG125",      year: 2024, ownerIdx: 3, daily: 1759, total: 950000,  joinDay: 35, reliability: 0.93 },
  { name: "Celestin Ndungutse",     phone: "+250789100015", nid: "1199880012345615", lic: "CN456V", plate: "RB 456P", make: "Bajaj",  model: "Boxer 150",  year: 2024, ownerIdx: 2, daily: 2222, total: 1200000, joinDay: 35, reliability: 0.87 },
];

// "Bad network" days where failure rate spikes (simulates real MTN outages)
const BAD_DAYS = [5, 12, 19, 33, 41, 55, 62, 70];

async function main() {
  console.log("Clearing old data...");
  await db.notification.deleteMany();
  await db.dispute.deleteMany();
  await db.ownershipRecord.deleteMany();
  await db.escrowLedger.deleteMany();
  await db.payment.deleteMany();
  await db.rentalAgreement.deleteMany();
  await db.session.deleteMany();
  await db.driver.deleteMany();
  await db.motorcycle.deleteMany();
  await db.user.deleteMany();

  // ── ADMIN ──────────────────────────────────────────────────────
  const admin = await db.user.create({
    data: { phone: "+250788000001", name: "Admin MotoLift", role: "ADMIN", passwordHash: hash("admin123") },
  });
  await db.session.create({
    data: { userId: admin.id, token: "admin-demo-token-2026", expiresAt: new Date("2026-12-31") },
  });

  // ── OWNERS ─────────────────────────────────────────────────────
  const ownerRecords = [];
  for (const o of OWNERS) {
    const u = await db.user.create({
      data: { phone: o.phone, name: o.name, role: "OWNER", passwordHash: hash(o.password) },
    });
    await db.session.create({
      data: { userId: u.id, token: `owner-token-${u.id.slice(-8)}`, expiresAt: new Date("2026-12-31") },
    });
    ownerRecords.push(u);
  }

  // ── DRIVERS + MOTOS + AGREEMENTS ───────────────────────────────
  const allAgreements = [];
  for (const d of DRIVERS) {
    const owner = ownerRecords[d.ownerIdx];
    const driverStart = new Date(PILOT_START.getTime() + d.joinDay * 86400000);

    const user = await db.user.create({
      data: { phone: d.phone, name: d.name, role: "DRIVER", passwordHash: hash("driver123") },
    });

    const driver = await db.driver.create({
      data: { userId: user.id, nationalId: d.nid, licenseNumber: d.lic, status: "ACTIVE" },
    });

    const moto = await db.motorcycle.create({
      data: { plateNumber: d.plate, make: d.make, model: d.model, year: d.year, totalPrice: d.total, status: "RENTED", ownerId: owner.id },
    });

    const agreement = await db.rentalAgreement.create({
      data: {
        driverId: driver.id, motorcycleId: moto.id, dailyPayment: d.daily,
        totalAmount: d.total, startDate: driverStart,
        expectedEndDate: new Date(driverStart.getTime() + 540 * 86400000),
        status: "ACTIVE",
      },
    });

    // Activation notification
    await db.notification.create({
      data: { userId: user.id, message: `MotoLift: Your account is now ACTIVE. You can begin making payments via *384#.`, channel: "SMS", sent: true, sentAt: driverStart, createdAt: driverStart },
    });

    allAgreements.push({ agreement, user, driver, moto, config: d });
  }

  // ── PAYMENTS (the big realistic data) ──────────────────────────
  console.log("Generating payments across 77 days...");
  let stats = { success: 0, failed: 0, missed: 0, retried: 0 };

  for (const ag of allAgreements) {
    const { agreement, user, moto, config } = ag;
    let cumPaid = 0;
    const daysActive = PILOT_DAYS - config.joinDay;

    for (let day = 0; day < daysActive; day++) {
      const absDay = config.joinDay + day;
      const payDate = new Date(PILOT_START.getTime() + absDay * 86400000);
      const dayOfWeek = payDate.getUTCDay(); // 0=Sun

      // Sunday: 40% chance of skipping entirely (drivers rest)
      if (dayOfWeek === 0 && rand(`${config.phone}-${absDay}-sun`) < 0.40) {
        stats.missed++;
        continue;
      }

      // Saturday: slightly lower reliability
      const satPenalty = dayOfWeek === 6 ? 0.05 : 0;

      // Bad network day: +25% failure chance
      const isBadDay = BAD_DAYS.includes(absDay);
      const failBoost = isBadDay ? 0.25 : 0;

      // Individual driver reliability determines outcome
      const effectiveReliability = config.reliability - satPenalty - failBoost;
      const roll = rand(`${config.phone}-${absDay}-roll`);

      // Payment time: cluster between 5:00-9:00 UTC (7:00-11:00 Kigali)
      // with a few late payers in the afternoon
      let hour, minute;
      const timeRoll = rand(`${config.phone}-${absDay}-time`);
      if (timeRoll < 0.65) {
        hour = 5 + Math.floor(rand(`${config.phone}-${absDay}-h1`) * 4); // 5-8 UTC
        minute = Math.floor(rand(`${config.phone}-${absDay}-m1`) * 60);
      } else if (timeRoll < 0.90) {
        hour = 9 + Math.floor(rand(`${config.phone}-${absDay}-h2`) * 3); // 9-11 UTC
        minute = Math.floor(rand(`${config.phone}-${absDay}-m2`) * 60);
      } else {
        hour = 12 + Math.floor(rand(`${config.phone}-${absDay}-h3`) * 6); // 12-17 UTC (late)
        minute = Math.floor(rand(`${config.phone}-${absDay}-m3`) * 60);
      }
      payDate.setUTCHours(hour, minute, Math.floor(rand(`${config.phone}-${absDay}-s`) * 60), 0);

      if (roll > effectiveReliability) {
        // MISSED — no payment at all
        stats.missed++;

        // On bad days, still create a reminder notification
        if (isBadDay) {
          await db.notification.create({
            data: { userId: user.id, message: `MotoLift Reminder: Payment of ${config.daily.toLocaleString()} RWF for ${moto.make} ${moto.model} is overdue. Dial *384# to pay.`, channel: "SMS", sent: true, sentAt: new Date(payDate.getTime() + 7200000), createdAt: payDate },
          });
        }
        continue;
      }

      // Payment method: 80% MoMo, 15% Airtel, 5% Cash
      const methodRoll = rand(`${config.phone}-${absDay}-meth`);
      const method = methodRoll < 0.80 ? "MOMO" : methodRoll < 0.95 ? "AIRTEL" : "CASH";
      const momoRef = `ml-${payDate.getTime()}-${config.phone.slice(-4)}`;

      // Determine success/fail
      const isFailed = isBadDay ? rand(`${config.phone}-${absDay}-fail`) < 0.45 : rand(`${config.phone}-${absDay}-fail`) < 0.04;

      if (isFailed) {
        // FAILED payment
        await db.payment.create({
          data: { agreementId: agreement.id, amount: config.daily, momoRef, method, status: "FAILED", paidAt: null, createdAt: payDate },
        });
        stats.failed++;

        await db.notification.create({
          data: { userId: user.id, message: `MotoLift: Payment of ${config.daily.toLocaleString()} RWF FAILED. ${isBadDay ? "Network issues detected." : "Please retry."} Dial *384#.`, channel: "SMS", sent: true, sentAt: new Date(payDate.getTime() + 10000), createdAt: payDate },
        });

        // Retry 1-3 hours later (65% of the time)
        if (rand(`${config.phone}-${absDay}-retry`) < 0.65) {
          const retryDelay = (1 + Math.floor(rand(`${config.phone}-${absDay}-rd`) * 3)) * 3600000;
          const retryDate = new Date(payDate.getTime() + retryDelay);
          const retryRef = `retry-${momoRef}`;

          await db.payment.create({
            data: { agreementId: agreement.id, amount: config.daily, momoRef: retryRef, method: "MOMO", status: "SUCCESS", paidAt: retryDate, createdAt: retryDate },
          });
          stats.retried++;
          stats.success++;
          cumPaid += config.daily;

          const pct = Math.min(100, (cumPaid / config.total) * 100);
          await db.escrowLedger.create({
            data: { agreementId: agreement.id, totalPaid: cumPaid, ownershipPercentage: parseFloat(pct.toFixed(4)), recordedAt: retryDate },
          });
          await db.notification.create({
            data: { userId: user.id, message: `MotoLift: Retry successful! ${config.daily.toLocaleString()} RWF received for ${moto.make} ${moto.model} (${moto.plateNumber}). Ownership: ${pct.toFixed(1)}%.`, channel: "SMS", sent: true, sentAt: new Date(retryDate.getTime() + 5000), createdAt: retryDate },
          });
        }
      } else {
        // SUCCESS
        await db.payment.create({
          data: { agreementId: agreement.id, amount: config.daily, momoRef, method, status: "SUCCESS", paidAt: payDate, createdAt: payDate },
        });
        stats.success++;
        cumPaid += config.daily;

        const pct = Math.min(100, (cumPaid / config.total) * 100);
        await db.escrowLedger.create({
          data: { agreementId: agreement.id, totalPaid: cumPaid, ownershipPercentage: parseFloat(pct.toFixed(4)), recordedAt: payDate },
        });
        await db.notification.create({
          data: { userId: user.id, message: `MotoLift: Payment of ${config.daily.toLocaleString()} RWF received for ${moto.make} ${moto.model} (${moto.plateNumber}). Ownership: ${pct.toFixed(1)}%. Thank you!`, channel: "SMS", sent: true, sentAt: new Date(payDate.getTime() + 5000), createdAt: payDate },
        });
      }
    }

    // Daily reminders (one per active day at 05:00 UTC = 07:00 Kigali)
    const dActive = PILOT_DAYS - config.joinDay;
    for (let day = 0; day < dActive; day++) {
      const absDay = config.joinDay + day;
      const rDate = new Date(PILOT_START.getTime() + absDay * 86400000);
      rDate.setUTCHours(5, 0, 0, 0);
      await db.notification.create({
        data: { userId: user.id, message: `MotoLift Reminder: Your daily payment of ${config.daily.toLocaleString()} RWF for ${moto.make} ${moto.model} is due today. Dial *384# to pay.`, channel: "SMS", sent: true, sentAt: rDate, createdAt: rDate },
      });
    }
  }

  // ── DISPUTES ───────────────────────────────────────────────────
  console.log("Creating disputes...");
  const disputeData = [
    { driverIdx: 4,  desc: "Payment on Feb 3 not showing in my status. I paid 1,852 RWF via MoMo but ownership did not update.", day: 22, status: "RESOLVED", resolveDay: 23 },
    { driverIdx: 6,  desc: "I was charged 2,222 RWF instead of 1,852 RWF on Monday. Wrong motorcycle linked?", day: 30, status: "RESOLVED", resolveDay: 32 },
    { driverIdx: 10, desc: "My account shows ACTIVE but I cannot make payments. USSD says no active agreement.", day: 38, status: "RESOLVED", resolveDay: 39 },
    { driverIdx: 12, desc: "Two payments deducted on the same day (Feb 18). I only confirmed one. Need refund.", day: 42, status: "UNDER_REVIEW", resolveDay: null },
    { driverIdx: 7,  desc: "Owner says I missed 3 days but my MoMo statement shows I paid. Receipts attached.", day: 50, status: "UNDER_REVIEW", resolveDay: null },
    { driverIdx: 2,  desc: "Network was down all day on March 5 but system still counted it as missed. Unfair.", day: 55, status: "OPEN", resolveDay: null },
    { driverIdx: 14, desc: "Ownership percentage seems lower than expected. I have paid every day since joining.", day: 65, status: "OPEN", resolveDay: null },
  ];

  for (const dd of disputeData) {
    const ag = allAgreements[dd.driverIdx];
    const createdAt = new Date(PILOT_START.getTime() + dd.day * 86400000 + 10 * 3600000);
    const resolvedAt = dd.resolveDay ? new Date(PILOT_START.getTime() + dd.resolveDay * 86400000 + 14 * 3600000) : null;

    const dispute = await db.dispute.create({
      data: { driverId: ag.driver.id, agreementId: ag.agreement.id, description: dd.desc, status: dd.status, resolvedAt, createdAt },
    });

    const ref = dispute.id.slice(-6).toUpperCase();
    await db.notification.create({
      data: { userId: ag.user.id, message: `MotoLift: Your dispute (#${ref}) has been received. We will review and contact you within 24 hours.`, channel: "SMS", sent: true, sentAt: new Date(createdAt.getTime() + 60000), createdAt },
    });

    if (dd.status === "RESOLVED") {
      await db.notification.create({
        data: { userId: ag.user.id, message: `MotoLift: Dispute #${ref} has been RESOLVED. Thank you for your patience.`, channel: "SMS", sent: true, sentAt: resolvedAt, createdAt: resolvedAt },
      });
    }
    if (dd.status === "UNDER_REVIEW") {
      await db.notification.create({
        data: { userId: ag.user.id, message: `MotoLift: Dispute #${ref} is now UNDER REVIEW. An agent has been assigned.`, channel: "SMS", sent: true, sentAt: new Date(createdAt.getTime() + 3600000), createdAt },
      });
    }
  }

  // ── SUMMARY ────────────────────────────────────────────────────
  const c = {
    users: await db.user.count(),
    drivers: await db.driver.count(),
    motorcycles: await db.motorcycle.count(),
    agreements: await db.rentalAgreement.count(),
    payments: await db.payment.count(),
    escrow: await db.escrowLedger.count(),
    disputes: await db.dispute.count(),
    notifications: await db.notification.count(),
    sessions: await db.session.count(),
  };
  const total = Object.values(c).reduce((a, b) => a + b, 0);

  console.log("\n=== SEED COMPLETE ===");
  Object.entries(c).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log(`  TOTAL: ${total}`);
  console.log(`\n  Payments: ${stats.success} success, ${stats.failed} failed, ${stats.missed} missed, ${stats.retried} retried`);
  console.log("\n  Login:");
  console.log("    Admin:  +250788000001 / admin123");
  console.log("    Owner:  +250788100001 / owner123");
  console.log("    Driver: +250789100001 / driver123");
}

main()
  .catch((e) => { console.error("Seed failed:", e); process.exit(1); })
  .finally(() => db.$disconnect());
