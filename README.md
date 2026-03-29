# MotoLift

A USSD-native, Mobile Money-integrated platform that converts daily motorcycle rental payments into structured rent-to-own installments for moto-taxi drivers in Kigali, Rwanda.

**Live Demo:** https://motolift-api-production.up.railway.app

**USSD Simulator:** https://motolift-api-production.up.railway.app/ussd-demo

**Repository:** https://github.com/Git-with-gideon/FoundationProject_MotoLift

## Problem

Over 70,000 motorcycles operate as moto-taxis in Rwanda. Most drivers don't own their bikes — they pay daily rental fees to fleet owners, consuming a large share of their income with no path to ownership. Existing solutions either require smartphones (which 66% of households don't have) or rigid monthly loan structures that don't match daily cash flows.

## Solution

MotoLift lets drivers register, browse available motorcycles, and make daily payments entirely through USSD (`*384#`) on basic feature phones. Each payment is tracked in an escrow ledger that calculates ownership percentage. After approximately 18 months of daily payments, the driver reaches 100% ownership and the motorcycle is transferred.

## System Architecture

![MotoLift System Architecture](public/images/architecture.png)

## Features

- **USSD Interface** — Drivers register, browse bikes, make payments, check status, and log disputes from any feature phone
- **Escrow Ledger** — Tracks cumulative payments and calculates real-time ownership percentage
- **Mobile Money Integration** — MTN MoMo and Airtel Money payment processing with automatic retry
- **Owner Dashboard** — Fleet management, driver assignment, payment tracking with Chart.js analytics
- **Admin Dashboard** — System-wide monitoring with 17 interactive charts, dispute resolution, SMS logs
- **Automated Notifications** — SMS receipts, daily payment reminders (07:00 Kigali time), status updates
- **Payment Retry Scheduler** — Failed payments automatically retried at 09:00 Kigali time

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express.js |
| Database | PostgreSQL, Prisma ORM |
| USSD Gateway | Africa's Talking |
| Payments | MTN MoMo API |
| Frontend | HTML, CSS, JavaScript, Chart.js |
| Testing | Jest, Supertest |
| Hosting | Railway (backend), Neon (database) |

## Project Structure

```
src/
  server.js              # Express server entry point
  db.js                  # Prisma client
  middleware/
    auth.js              # Session-based authentication
  routes/
    auth.js              # Login, register, logout
    ussd.js              # USSD flows (register, browse bikes, pay, disputes)
    payments.js          # Payment initiation, MoMo callbacks, escrow
    drivers.js           # Driver CRUD and status management
    motorcycles.js       # Motorcycle inventory
    owner.js             # Owner fleet management
    disputes.js          # Dispute creation and resolution
    notifications.js     # SMS notification management
    stats.js             # Dashboard statistics
  services/
    momo.js              # MTN MoMo API integration
    sms.js               # Africa's Talking SMS
    notifications.js     # Message composition and delivery
    scheduler.js         # Cron jobs (reminders, retries)
prisma/
  schema.prisma          # Database schema (10 models)
  seed.js                # Seed script (3,340 records)
  migrations/            # PostgreSQL migrations
public/
  dashboard.html         # Admin dashboard (17 charts)
  owner.html             # Owner dashboard
  login.html             # Authentication page
  driver.html            # Driver profile view
  ussd-demo.html         # Web-based USSD simulator
  css/app.css            # Design system
tests/
  auth.test.js           # Authentication tests
  drivers.test.js        # Driver management tests
  payments.test.js       # Payment flow tests
  ussd.test.js           # USSD interaction tests
  middleware.test.js     # Auth middleware tests
  validation.test.js     # Input validation tests
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database

### Setup

```bash
git clone https://github.com/Git-with-gideon/FoundationProject_MotoLift.git
cd FoundationProject_MotoLift
npm install
```

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Update `DATABASE_URL` in `.env` with your PostgreSQL connection string.

### Database

```bash
npx prisma migrate dev     # Run migrations
npx prisma db seed         # Seed with sample data
```

### Run

```bash
npm run dev                # Development (with hot reload)
npm start                  # Production
```

The server starts at `http://localhost:3000`.

### Test

```bash
npm test                   # Run all 23 tests
```

## Database Schema (ERD)

![MotoLift Entity-Relationship Diagram](public/images/erd.png)

## UML Class Diagram

![MotoLift UML Diagram](public/images/uml.png)

## USSD Flow

```
Dial *384#
  |
  New user?
  |-- Yes --> Register (name, NID, license)
  |            |-- Dial again --> Browse available bikes
  |                                |-- Select bike --> Agreement created, status: ACTIVE
  |                                     |-- Dial again --> Full driver menu
  |
  |-- Registered (no bike) --> Browse Available Bikes
  |                             |-- Select & confirm --> ACTIVE
  |
  |-- Active driver --> 1. My Status
                        2. Make Payment (MoMo / Airtel)
                        3. Recent Payments
                        4. Log Dispute
```

## Demo Credentials

| Role | Phone | Password |
|------|-------|----------|
| Admin | +250788000001 | admin123 |
| Owner (Jean-Claude) | +250788100001 | owner123 |
| Owner (Diane) | +250788100002 | owner123 |
| Driver (Emmanuel) | +250789100001 | driver123 |

## Team

| Name | Role |
|------|------|
| Erioluwa Gideon Olowoyo | Project Manager |
| Wisdom Okechukwu Ikechukwu | Lead Engineer II |
| Igor Ntwali | Lead Engineer I |
| Cyuzuzo Germain | Database Architect |
| Alieu Jobe | Software Tester |

## License

This project was built as part of the BSc. Software Engineering Foundations Project at African Leadership University (ALU), March 2026.
