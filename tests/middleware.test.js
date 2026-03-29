jest.mock("../src/db", () => ({
  session: { findUnique: jest.fn() },
}));

const db = require("../src/db");
const { requireAuth, requireAdmin } = require("../src/middleware/auth");

function mockReqRes(token) {
  return {
    req: { headers: { authorization: token ? `Bearer ${token}` : undefined }, user: null },
    res: { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() },
    next: jest.fn(),
  };
}

describe("Auth Middleware", () => {
  beforeEach(() => jest.clearAllMocks());

  test("rejects request without token", async () => {
    const { req, res, next } = mockReqRes(null);
    await requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("allows valid session through", async () => {
    db.session.findUnique.mockResolvedValue({
      token: "tok", expiresAt: new Date(Date.now() + 86400000),
      user: { id: "a1", role: "ADMIN", name: "Admin" },
    });
    const { req, res, next } = mockReqRes("tok");
    await requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user.role).toBe("ADMIN");
  });

  test("blocks non-admin from admin routes", async () => {
    db.session.findUnique.mockResolvedValue({
      token: "tok", expiresAt: new Date(Date.now() + 86400000),
      user: { id: "d1", role: "DRIVER", name: "Driver" },
    });
    const { req, res, next } = mockReqRes("tok");
    await requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
