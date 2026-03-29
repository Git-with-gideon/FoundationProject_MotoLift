const db = require("../db");
const { sendSMS } = require("./sms");

async function saveAndSend(userId, phone, message) {
  const notif = await db.notification.create({
    data: { userId, message, channel: "SMS" },
  });
  try {
    await sendSMS(phone, message);
    await db.notification.update({
      where: { id: notif.id },
      data: { sent: true, sentAt: new Date() },
    });
  } catch (err) {
    console.error(`[SMS] Failed to send to ${phone}:`, err.message);
  }
  return notif;
}

async function sendPaymentReceipt(payment) {
  const agreement = await db.rentalAgreement.findUnique({
    where: { id: payment.agreementId },
    include: {
      driver: { include: { user: true } },
      motorcycle: true,
      escrow: { orderBy: { recordedAt: "desc" }, take: 1 },
    },
  });
  if (!agreement) return;

  const { user } = agreement.driver;
  const ownership =
    agreement.escrow[0]?.ownershipPercentage?.toFixed(1) || "0.0";
  const message =
    `MotoLift: Payment of ${payment.amount.toLocaleString()} RWF received for ` +
    `${agreement.motorcycle.make} ${agreement.motorcycle.model} ` +
    `(${agreement.motorcycle.plateNumber}). ` +
    `Ownership: ${ownership}%. Thank you!`;

  return saveAndSend(user.id, user.phone, message);
}

async function sendPaymentReminder(agreement) {
  const { user } = agreement.driver;
  const message =
    `MotoLift Reminder: Your daily payment of ${agreement.dailyPayment.toLocaleString()} RWF ` +
    `for ${agreement.motorcycle.make} ${agreement.motorcycle.model} is due today. ` +
    `Dial *384# to pay.`;

  return saveAndSend(user.id, user.phone, message);
}

async function sendStatusChangeNotification(driver, newStatus) {
  const { user } = driver;
  const statusMessages = {
    ACTIVE:
      "Your MotoLift account is now ACTIVE. You can begin making payments.",
    SUSPENDED:
      "Your MotoLift account has been SUSPENDED. Contact support for help.",
    PENDING: "Your MotoLift account is under review.",
  };
  const message = `MotoLift: ${statusMessages[newStatus] || `Status updated to ${newStatus}.`}`;
  return saveAndSend(user.id, user.phone, message);
}

async function sendDisputeAcknowledgement(dispute) {
  const driver = await db.driver.findUnique({
    where: { id: dispute.driverId },
    include: { user: true },
  });
  if (!driver) return;

  const ref = dispute.id.slice(-6).toUpperCase();
  const message =
    `MotoLift: Your dispute (#${ref}) has been received and is under review. ` +
    `We will contact you within 24 hours.`;

  return saveAndSend(driver.user.id, driver.user.phone, message);
}

module.exports = {
  sendPaymentReceipt,
  sendPaymentReminder,
  sendStatusChangeNotification,
  sendDisputeAcknowledgement,
};
