jest.mock("../src/db", () => ({
  session: { findUnique: jest.fn() },
  user: { create: jest.fn(), delete: jest.fn() },
  driver: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn() },
  motorcycle: { update: jest.fn() },
  rentalAgreement: { create: jest.fn() },
  $transaction: jest.fn(),
}));

jest.mock("../src/services/notifications", () => ({
  sendStatusChangeNotification: jest.fn().mockResolvedValue({}),
  sendPaymentReceipt: jest.fn(),
  sendPaymentReminder: jest.fn(),
  sendDisputeAcknowledgement: jest.fn(),
}));

const request = require("supertest");
const express = require("express");
const db = require("../src/db");
const driverRoutes = require("../src/routes/drivers");

const app = express();
app.use(express.json());
app.use("/api/drivers", driverRoutes);

const adminSession = {
  token: "tok", expiresAt: new Date(Date.now() + 86400000),
  user: { id: "a1", role: "ADMIN", name: "Admin" },
};

describe("Driver Routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.session.findUnique.mockResolvedValue(adminSession);
    db.$transaction.mockImplementation(async (cb) => cb(db));
  });

  test("rejects invalid license format", async () => {
    const res = await request(app)
      .post("/api/drivers")
      .set("Authorization", "Bearer tok")
      .send({
        phone: "+250789000001", nationalId: "119988001234", licenseNumber: "BADFORMAT",
        motorcycleId: "m1", dailyPayment: 2222, totalAmount: 1200000,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/license/i);
  });

  test("lists drivers with pagination", async () => {
    db.driver.count.mockResolvedValue(5);
    db.driver.findMany.mockResolvedValue([{ id: "d1", status: "ACTIVE" }]);

    const res = await request(app)
      .get("/api/drivers?page=1&limit=10")
      .set("Authorization", "Bearer tok");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(5);
    expect(res.body.data).toHaveLength(1);
  });

  test("blocks deletion of driver with active agreement", async () => {
    db.driver.findUnique.mockResolvedValue({
      id: "d1", userId: "u1", agreements: [{ status: "ACTIVE" }],
      user: { id: "u1" },
    });

    const res = await request(app)
      .delete("/api/drivers/d1")
      .set("Authorization", "Bearer tok");

    expect(res.status).toBe(400);
  });

  test("updates driver status", async () => {
    db.driver.update.mockResolvedValue({
      id: "d1", status: "SUSPENDED", user: { id: "u1", phone: "+250789000001" },
    });

    const res = await request(app)
      .patch("/api/drivers/d1/status")
      .set("Authorization", "Bearer tok")
      .send({ status: "SUSPENDED" });

    expect(res.status).toBe(200);
  });
});
