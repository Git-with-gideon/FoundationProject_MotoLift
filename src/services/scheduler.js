const cron = require("node-cron");
const db = require("../db");
const { sendPaymentReminder } = require("./notifications");
const { requestToPay } = require("./momo");

function startScheduler() {
  // Daily reminders at 07:00 Kigali (05:00 UTC)
  cron.schedule("0 5 * * *", async () => {
    console.log("[Scheduler] Sending daily payment reminders...");
    try {
      const agreements = await db.rentalAgreement.findMany({
        where: { status: "ACTIVE" },
        include: { driver: { include: { user: true } }, motorcycle: true },
      });
      let sent = 0;
      for (const ag of agreements) {
        if (ag.driver.status !== "ACTIVE") continue;
        await sendPaymentReminder(ag).catch((err) =>
          console.error(`[Scheduler] Reminder failed ${ag.id}:`, err.message),
        );
        sent++;
      }
      console.log(`[Scheduler] Sent ${sent} reminders.`);
    } catch (err) {
      console.error("[Scheduler] Reminder error:", err.message);
    }
  });

  // Retry failed payments at 09:00 Kigali (07:00 UTC)
  cron.schedule("0 7 * * *", async () => {
    console.log("[Scheduler] Retrying failed payments...");
    try {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const failed = await db.payment.findMany({
        where: { status: "FAILED", createdAt: { gte: yesterday } },
        include: {
          agreement: {
            include: { driver: { include: { user: true } }, motorcycle: true },
          },
        },
      });

      let retried = 0;
      for (const payment of failed) {
        const { agreement } = payment;
        if (
          agreement.status !== "ACTIVE" ||
          agreement.driver.status !== "ACTIVE"
        )
          continue;

        const externalId = `retry-${payment.id}-${Date.now()}`;
        try {
          await requestToPay({
            amount: payment.amount,
            phone: agreement.driver.user.phone,
            externalId,
            note: `MotoLift retry - ${agreement.motorcycle.plateNumber}`,
          });
          await db.payment.create({
            data: {
              agreementId: agreement.id,
              amount: payment.amount,
              method: payment.method,
              status: "PENDING",
              momoRef: externalId,
            },
          });
          retried++;
        } catch (err) {
          console.error(
            `[Scheduler] Retry failed for payment ${payment.id}:`,
            err.message,
          );
        }
      }
      console.log(`[Scheduler] Retried ${retried} failed payments.`);
    } catch (err) {
      console.error("[Scheduler] Retry error:", err.message);
    }
  });

  console.log("[Scheduler] Started (reminders 05:00 UTC, retries 07:00 UTC).");
}

module.exports = { startScheduler };
