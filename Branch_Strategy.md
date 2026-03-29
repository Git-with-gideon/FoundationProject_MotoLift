# MotoLift — Branch Contributions

## Germain (Database Architect) — `feature/database-schema`
- `prisma/schema.prisma` — all 10 data models, enums, and relationships
- `prisma/migrations/` — initial PostgreSQL migration
- `prisma/seed.js` — seed script with 15 drivers, 777 payments, 3,340 total records
- `src/db.js` — PrismaClient singleton

## Igor (Lead Engineer I) — `feature/backend-api`
- `src/server.js` — Express server setup, route mounting, static file serving
- `src/middleware/auth.js` — requireAuth and requireAdmin middleware
- `src/routes/auth.js` — login, register-owner, logout
- `src/routes/drivers.js` — driver CRUD with license validation
- `src/routes/motorcycles.js` — motorcycle CRUD with plate validation
- `src/routes/stats.js` — admin dashboard statistics
- `src/routes/notifications.js` — SMS notification listing and manual send
- `package.json`, `.env.example`, `.gitignore`

## Erioluwa (Project Manager) — `feature/ussd-payments`
- `src/routes/ussd.js` — multi-step USSD flows (registration, bike browsing, payments, disputes)
- `src/routes/payments.js` — payment initiation, MoMo callback, escrow updates
- `src/routes/disputes.js` — dispute creation, review, resolution
- `src/routes/owner.js` — owner fleet management, driver assignment, payment history
- `src/services/momo.js` — MTN MoMo API integration with simulation fallback
- `src/services/sms.js` — Africa's Talking SMS service
- `src/services/notifications.js` — message composition and delivery
- `src/services/scheduler.js` — cron jobs for reminders and payment retries
- `ussd-sim.js` — local USSD simulator tool
- `steps.md` — demo walkthrough

## Alieu (Software Tester) — `feature/frontend-dashboard`
- `public/login.html` — sign-in and owner registration
- `public/dashboard.html` — admin dashboard with 17 Chart.js analytics
- `public/owner.html` — owner fleet management dashboard
- `public/driver.html` — driver profile with payment history
- `public/ussd-demo.html` — web-based USSD simulator
- `public/index.html` — landing page
- `public/css/app.css` — design system and global styles

## Wisdom (Lead Engineer II) — `feature/testing`
- `jest.config.js` — test configuration
- `tests/auth.test.js` — login, registration, password validation
- `tests/drivers.test.js` — license validation, pagination, status updates
- `tests/payments.test.js` — payment initiation, MoMo callback, escrow
- `tests/ussd.test.js` — USSD menus, status display, dispute logging
- `tests/middleware.test.js` — token validation, role enforcement
- `tests/validation.test.js` — plate formats, license formats, escrow calculation
- `tests/helpers/` — fixtures and mock setup
- 23 tests across 6 test files, all passing

---

## Summary

| Branch | Member | Role | Files | What They Built |
|--------|--------|------|-------|-----------------|
| `feature/database-schema` | Germain | Database Architect | prisma/, src/db.js | Schema, migrations, seed data (3,340 records) |
| `feature/backend-api` | Igor | Lead Engineer I | src/server.js, middleware/, 5 route files | Auth, drivers, motorcycles, stats, notifications |
| `feature/ussd-payments` | Erioluwa | Project Manager | 4 route files, 4 services, ussd-sim | USSD flows, payments, escrow, MoMo, SMS, scheduler |
| `feature/frontend-dashboard` | Alieu | Software Tester | public/ (6 HTML, 1 CSS) | Login, dashboards, 17 charts, USSD web demo |
| `feature/testing` | Wisdom | Lead Engineer II | jest.config.js, 6 test files, helpers | 23 tests (auth, drivers, payments, USSD, validation) |
