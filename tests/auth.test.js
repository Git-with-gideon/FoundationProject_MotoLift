const crypto = require("crypto");

jest.mock("../src/db", () => ({
  user: { findUnique: jest.fn(), create: jest.fn() },
  session: { create: jest.fn(), deleteMany: jest.fn() },
}));

const request = require("supertest");
const express = require("express");
const db = require("../src/db");
const authRoutes = require("../src/routes/auth");

const app = express();
app.use(express.json());
app.use("/api/auth", authRoutes);

const hash = (pw) => crypto.createHash("sha256").update(pw).digest("hex");

describe("Auth Routes", () => {
  beforeEach(() => jest.clearAllMocks());

  test("login returns token for valid credentials", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1", phone: "+250789000001", name: "Test", role: "ADMIN",
      passwordHash: hash("test1234"),
    });
    db.session.create.mockResolvedValue({});

    const res = await request(app)
      .post("/api/auth/login")
      .send({ phone: "+250789000001", password: "test1234" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.role).toBe("ADMIN");
  });

  test("login rejects wrong password", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1", phone: "+250789000001", passwordHash: hash("test1234"),
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ phone: "+250789000001", password: "wrong" });

    expect(res.status).toBe(401);
  });

  test("register-owner creates account and returns token", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({ id: "o1", phone: "+250788000001", name: "Owner", role: "OWNER" });
    db.session.create.mockResolvedValue({});

    const res = await request(app)
      .post("/api/auth/register-owner")
      .send({ phone: "+250788000001", name: "Owner", password: "secure123" });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe("OWNER");
  });

  test("register-owner rejects short password", async () => {
    const res = await request(app)
      .post("/api/auth/register-owner")
      .send({ phone: "+250788000001", name: "Owner", password: "abc" });

    expect(res.status).toBe(400);
  });
});
