#!/usr/bin/env node
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let phone = "";
let sessionId = "";
let text = "";

function prompt(q) {
  return new Promise((resolve) => rl.question(q, resolve));
}

function display(message) {
  const lines = message.split("\n");
  const maxLen = Math.max(...lines.map((l) => l.length), 28);
  const border = "─".repeat(maxLen + 2);
  console.log(`\n  ┌${border}┐`);
  lines.forEach((line) => console.log(`  │ ${line.padEnd(maxLen)} │`));
  console.log(`  └${border}┘`);
}

async function send() {
  try {
    const res = await fetch("http://localhost:3000/ussd", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ sessionId, phoneNumber: phone, text }),
    });
    const body = await res.text();
    const type = body.startsWith("CON") ? "CON" : "END";
    const message = body.replace(/^(CON|END)\s?/, "");

    display(message);

    if (type === "END") {
      return false;
    }

    const input = await prompt("\n  >> ");
    text = text ? text + "*" + input.trim() : input.trim();
    return true;
  } catch {
    console.error("\n  Could not reach server. Is it running on port 3000?\n");
    return false;
  }
}

async function startSession() {
  sessionId = "sim-" + Date.now();
  text = "";

  console.log(`\n  ── Dialing *384# ──`);

  let active = true;
  while (active) {
    active = await send();
  }

  console.log("\n  [Session ended]");
}

async function main() {
  console.log("");
  console.log("  ╔═══════════════════════════════╗");
  console.log("  ║   MotoLift USSD Simulator     ║");
  console.log("  ╚═══════════════════════════════╝");
  console.log("");

  phone = await prompt("  Enter your phone number: ");
  phone = phone.trim();
  if (!phone) {
    console.log("  No phone number entered.");
    process.exit(0);
  }

  console.log(`\n  Phone: ${phone}`);
  console.log('  Type "dial" to start a session, "exit" to quit.\n');

  while (true) {
    const cmd = await prompt("  📱 > ");
    const input = cmd.trim().toLowerCase();

    if (input === "exit" || input === "quit" || input === "q") {
      console.log("\n  Goodbye!\n");
      process.exit(0);
    }

    if (
      input === "dial" ||
      input === "*384#" ||
      input === "d" ||
      input === ""
    ) {
      await startSession();
      console.log('\n  Type "dial" to start a new session, "exit" to quit.\n');
    } else if (input === "phone") {
      phone = await prompt("  Enter new phone number: ");
      phone = phone.trim();
      console.log(`  Phone changed to: ${phone}\n`);
    } else {
      console.log("  Commands: dial / *384# / phone / exit\n");
    }
  }
}

main();
