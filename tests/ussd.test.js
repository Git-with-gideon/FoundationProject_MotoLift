jest.mock("../src/db", () => ({
  user: { findUnique: jest.fn(), create: jest.fn() },
  driver: { create: jest.fn() },
  payment: { create: jest.fn(), update: jest.fn(), aggregate: jest.fn() },
  escrowLedger: { create: jest.fn() },
  rentalAgreement: { update: jest.fn() },
  ownershipRecord: { upsert: jest.fn() },
  dispute: { create: jest.fn() },
  notification: { create: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(),
}));

jest.mock("../src/services/momo", () => ({
  requestToPay: jest.fn().mockResolvedValue({ referenceId: "ref", simulated: true }),
}));

jest.mock("../src/services/notifications", () => ({
  sendPaymentReceipt: jest.fn().mockResolvedValue({}),
}));

const request = require("supertest");
const express = require("express");
const db = require("../src/db");
const ussdRoutes = require("../src/routes/ussd");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/ussd", ussdRoutes);

const motorcycle = { make: "Bajaj", model: "Boxer 150", plateNumber: "RA 234B" };
const escrow = [{ ownershipPercentage: 5.5, totalPaid: 66660 }];
const payments = [{ createdAt: new Date(), status: "SUCCESS", amount: 2222 }];

const registeredUser = {
  id: "u1", name: "Emmanuel", phone: "+250789000001",
  driver: {
    id: "d1", status: "ACTIVE",
    agreements: [{
      id: "ag1", dailyPayment: 2222, totalAmount: 1200000, status: "ACTIVE",
      motorcycle, escrow, payments,
    }],
  },
};

describe("USSD Routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.$transaction.mockImplementation(async (cb) => cb(db));
  });

  test("shows registration menu for new users", async () => {
    db.user.findUnique.mockResolvedValue(null);

    const res = await request(app).post("/ussd")
      .send({ sessionId: "s1", phoneNumber: "+250789999999", text: "" });

    expect(res.text).toContain("Register as Driver");
  });

  test("shows driver menu for registered users", async () => {
    db.user.findUnique.mockResolvedValue(registeredUser);

    const res = await request(app).post("/ussd")
      .send({ sessionId: "s2", phoneNumber: "+250789000001", text: "" });

    expect(res.text).toContain("My Status");
    expect(res.text).toContain("Make Payment");
  });

  test("shows ownership status", async () => {
    db.user.findUnique.mockResolvedValue(registeredUser);

    const res = await request(app).post("/ussd")
      .send({ sessionId: "s3", phoneNumber: "+250789000001", text: "1" });

    expect(res.text).toContain("Bajaj Boxer 150");
    expect(res.text).toContain("Ownership");
  });

  test("logs dispute and returns reference", async () => {
    db.user.findUnique.mockResolvedValue(registeredUser);
    db.dispute.create.mockResolvedValue({ id: "disp-abc123" });

    const res = await request(app).post("/ussd")
      .send({ sessionId: "s4", phoneNumber: "+250789000001", text: "4*1" });

    expect(res.text).toContain("Dispute logged");
  });

  test("exits gracefully", async () => {
    db.user.findUnique.mockResolvedValue(null);

    const res = await request(app).post("/ussd")
      .send({ sessionId: "s5", phoneNumber: "+250789000001", text: "0" });

    expect(res.text).toContain("Goodbye");
  });
});
