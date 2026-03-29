jest.mock("../src/db", () => ({
  session: { findUnique: jest.fn() },
  rentalAgreement: { findUnique: jest.fn(), update: jest.fn() },
  payment: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn(), aggregate: jest.fn() },
  escrowLedger: { create: jest.fn() },
  ownershipRecord: { upsert: jest.fn() },
  notification: { create: jest.fn(), update: jest.fn() },
}));

jest.mock("../src/services/momo", () => ({
  requestToPay: jest.fn().mockResolvedValue({ referenceId: "ref1", simulated: true }),
  getPaymentStatus: jest.fn().mockResolvedValue({ status: "SUCCESSFUL", simulated: true }),
}));

jest.mock("../src/services/notifications", () => ({
  sendPaymentReceipt: jest.fn().mockResolvedValue({}),
}));

const request = require("supertest");
const express = require("express");
const db = require("../src/db");
const paymentRoutes = require("../src/routes/payments");

const app = express();
app.use(express.json());
app.use("/api/payments", paymentRoutes);

const driverSession = {
  token: "dtok", expiresAt: new Date(Date.now() + 86400000),
  user: { id: "u1", role: "DRIVER", name: "Driver" },
};
const adminSession = {
  token: "atok", expiresAt: new Date(Date.now() + 86400000),
  user: { id: "a1", role: "ADMIN", name: "Admin" },
};

const agreement = {
  id: "ag1", driverId: "d1", motorcycleId: "m1", dailyPayment: 2222,
  totalAmount: 1200000, status: "ACTIVE",
  driver: { user: { phone: "+250789000001" } },
  motorcycle: { plateNumber: "RA 234B" },
};

describe("Payment Routes", () => {
  beforeEach(() => jest.clearAllMocks());

  test("initiates payment in simulation mode", async () => {
    db.session.findUnique.mockResolvedValue(driverSession);
    db.rentalAgreement.findUnique.mockResolvedValue(agreement);
    db.payment.create.mockResolvedValue({ id: "p1", status: "PENDING", amount: 2222 });
    db.payment.update.mockResolvedValue({});
    db.payment.aggregate.mockResolvedValue({ _sum: { amount: 2222 } });
    db.escrowLedger.create.mockResolvedValue({});
    db.payment.findUnique.mockResolvedValue({ id: "p1", status: "SUCCESS", amount: 2222 });

    const res = await request(app)
      .post("/api/payments/initiate")
      .set("Authorization", "Bearer dtok")
      .send({ agreementId: "ag1" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("SUCCESS");
  });

  test("rejects payment for inactive agreement", async () => {
    db.session.findUnique.mockResolvedValue(driverSession);
    db.rentalAgreement.findUnique.mockResolvedValue({ ...agreement, status: "COMPLETED" });

    const res = await request(app)
      .post("/api/payments/initiate")
      .set("Authorization", "Bearer dtok")
      .send({ agreementId: "ag1" });

    expect(res.status).toBe(400);
  });

  test("MoMo callback confirms payment", async () => {
    db.payment.findFirst.mockResolvedValue({ id: "p1", agreementId: "ag1", amount: 2222, status: "PENDING" });
    db.rentalAgreement.findUnique.mockResolvedValue(agreement);
    db.payment.update.mockResolvedValue({});
    db.payment.aggregate.mockResolvedValue({ _sum: { amount: 4444 } });
    db.escrowLedger.create.mockResolvedValue({});
    db.payment.findUnique.mockResolvedValue({ id: "p1", status: "SUCCESS" });

    const res = await request(app)
      .post("/api/payments/callback")
      .send({ referenceId: "ref1", status: "SUCCESSFUL" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
