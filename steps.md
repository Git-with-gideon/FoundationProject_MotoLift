# MotoLift Demo Script

## Prerequisites

- **Node.js** (v18 or higher)
- **PostgreSQL** running on localhost

---

## First-time Setup

```bash
# 1. Navigate to the project
cd ~/Desktop/test89

# 2. Install dependencies
npm install

# 3. Create the database (if not already created)
psql -U Apple -d postgres -c "CREATE DATABASE motolift;"

# 4. Copy environment file and update DB credentials
cp .env.example .env
# Edit .env and set: DATABASE_URL="postgresql://Apple@localhost:5432/motolift"

# 5. Run database migrations
npm run db:migrate

# 6. Seed the database with admin + sample owner
npm run db:seed

# 7. Start the server
npm run dev
```

You should see:

```
MotoLift server running on port 3000
[Scheduler] Started (reminders 05:00 UTC, retries 07:00 UTC).
```

**Default login credentials after seeding:**

| Role  | Phone         | Password |
| ----- | ------------- | -------- |
| Admin | +250700000001 | admin123 |
| Owner | +250700000002 | owner123 |

---

## Running the Demo

Open **two browser tabs** and **one terminal** side by side.

---

## Step 1 — Show the Owner registering

**Browser Tab 1:** `http://localhost:3000/login.html`

- Click **"Register as Owner"** tab
- Enter: `John Kagame`, `+250788000001`, password `demo123`
- Click **Create Account** — lands on empty owner dashboard

---

## Step 2 — Owner adds motorcycles

- Click **+ Add Motorcycle**
- Pick **Bajaj Boxer 150**, year `2024`, price auto-fills → **Add**
- Add a second: **TVS Apache RTR 200**, year `2023` → **Add**
- Fleet now shows 2 bikes, both **AVAILABLE**

---

## Step 3 — Driver self-registers via USSD

**Terminal:**

```bash
node ussd-sim.js
```

- Enter phone: `+250789000001`
- Type `dial`
- Press `1` (Register as Driver)
- Enter name: `Emmanuel Habimana`
- Enter NID: `1199880012345678`
- Enter license: `RWxxxA`
- Press `1` (Confirm)
- Shows: _"Registration successful! Status: PENDING"_

**Register a second driver:**

- Type `dial` again
- Switch phone with `phone` command → `+250789000002`
- Register: `Marie Claire Uwase`, NID `1199990087654321`, License `RW-DL-007722`

---

## Step 4 — Owner assigns drivers to bikes

**Browser Tab 1 (Owner):**

- Click **Drivers** tab — both pending drivers appear
- Click **Assign** on Emmanuel → pick Bajaj Boxer 150 → daily auto-fills → **Assign**
- Click **Assign** on Marie Claire → pick TVS Apache RTR 200 → **Assign**
- Switch to **Fleet** tab — both bikes now show RENTED with driver names and 0% ownership

---

## Step 5 — Driver makes payment via USSD

**Terminal:**

- Type `phone` → enter `+250789000001` (Emmanuel)
- Type `dial`
- Now shows the registered driver menu (My Status, Make Payment, etc.)
- Press `2` (Make Payment)
- Press `1` (MTN MoMo)
- Press `1` (Confirm)
- Shows: _"Payment confirmed! 2,222 RWF received. Ownership: 0.2%"_
- Do it 2-3 more times to show ownership climbing

---

## Step 6 — Owner sees payments in real-time

**Browser Tab 1 (Owner):**

- Click **Fleet** — ownership % has increased, Collected shows RWF
- Click **Payment History** — all payments listed with SUCCESS status

---

## Step 7 — Admin sees everything

**Browser Tab 2:** `http://localhost:3000/login.html`

- Login: `+250700000001` / `admin123`
- **Overview** — stats show active drivers, collected amount
- **Drivers** tab — Emmanuel and Marie Claire both ACTIVE
- **Motorcycles** tab — both bikes RENTED
- **Payments** tab — all MoMo payments listed
- **SMS Log** — activation notifications + payment receipts

---

## Step 8 — Show dispute flow

**Terminal (as Emmanuel):**

- `dial` → press `4` (Log Dispute) → press `1` (Payment not recorded)
- Shows: _"Dispute logged. Ref: #XXXXXX"_

**Browser Tab 2 (Admin):**

- Click **Disputes** tab — dispute appears with OPEN status
- Click **Review** → status changes to UNDER REVIEW
- Click **Resolve** → done

---
