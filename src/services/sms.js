const AfricasTalking = require("africastalking");

let smsClient = null;

function getClient() {
  if (!smsClient) {
    const at = AfricasTalking({
      apiKey: process.env.AT_API_KEY,
      username: process.env.AT_USERNAME || "sandbox",
    });
    smsClient = at.SMS;
  }
  return smsClient;
}

const PLACEHOLDER = "your_api_key_here";

async function sendSMS(to, message) {
  if (!process.env.AT_API_KEY || process.env.AT_API_KEY === PLACEHOLDER) {
    console.log(`[SMS] To: ${to} | ${message}`);
    return { status: "simulated" };
  }
  const client = getClient();
  return client.send({
    to: Array.isArray(to) ? to : [to],
    message,
    from: process.env.AT_SENDER_ID || undefined,
  });
}

module.exports = { sendSMS };
