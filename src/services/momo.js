const crypto = require("crypto");

const BASE_URL =
  process.env.MOMO_BASE_URL || "https://sandbox.momodeveloper.mtn.com";
const SUB_KEY = process.env.MOMO_SUBSCRIPTION_KEY;
const API_USER = process.env.MOMO_API_USER;
const API_KEY = process.env.MOMO_API_KEY;
const ENV = process.env.MOMO_ENVIRONMENT || "sandbox";

function basicAuth() {
  return Buffer.from(`${API_USER}:${API_KEY}`).toString("base64");
}

async function getToken() {
  const res = await fetch(`${BASE_URL}/collection/token/`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Ocp-Apim-Subscription-Key": SUB_KEY,
    },
  });
  if (!res.ok) throw new Error(`MoMo token error: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

// Initiate a debit (request to pay) from a driver's MoMo wallet
const PLACEHOLDERS = [
  "your_subscription_key",
  "your_api_user",
  "your_momo_api_key",
];
function isConfigured() {
  return (
    SUB_KEY &&
    API_USER &&
    API_KEY &&
    !PLACEHOLDERS.includes(SUB_KEY) &&
    !PLACEHOLDERS.includes(API_USER) &&
    !PLACEHOLDERS.includes(API_KEY)
  );
}

async function requestToPay({ amount, phone, externalId, note }) {
  if (!isConfigured()) {
    console.log(
      `[MoMo] SIMULATED: Request to pay ${amount} RWF from ${phone} (ref: ${externalId})`,
    );
    return { referenceId: externalId, simulated: true };
  }

  const referenceId = crypto.randomUUID();
  const token = await getToken();

  const res = await fetch(`${BASE_URL}/collection/v1_0/requesttopay`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Reference-Id": referenceId,
      "X-Target-Environment": ENV,
      "Ocp-Apim-Subscription-Key": SUB_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: String(amount),
      currency: "RWF",
      externalId,
      payer: { partyIdType: "MSISDN", partyId: phone.replace("+", "") },
      payerMessage: note || "MotoLift daily payment",
      payeeNote: note || "MotoLift daily payment",
    }),
  });

  if (res.status !== 202)
    throw new Error(`MoMo requestToPay failed: ${res.status}`);
  return { referenceId };
}

// Check the status of a payment
async function getPaymentStatus(referenceId) {
  if (!isConfigured()) return { status: "SUCCESSFUL", simulated: true };

  const token = await getToken();
  const res = await fetch(
    `${BASE_URL}/collection/v1_0/requesttopay/${referenceId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Target-Environment": ENV,
        "Ocp-Apim-Subscription-Key": SUB_KEY,
      },
    },
  );
  if (!res.ok) throw new Error(`MoMo status check failed: ${res.status}`);
  return res.json();
}

module.exports = { requestToPay, getPaymentStatus };
