require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const ussdRoutes = require("./routes/ussd");
const paymentRoutes = require("./routes/payments");
const driverRoutes = require("./routes/drivers");
const authRoutes = require("./routes/auth");
const notificationRoutes = require("./routes/notifications");
const disputeRoutes = require("./routes/disputes");
const ownerRoutes = require("./routes/owner");
const motorcycleRoutes = require("./routes/motorcycles");
const statsRoutes = require("./routes/stats");
const { startScheduler } = require("./services/scheduler");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));

// API routes
app.use("/ussd", ussdRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/drivers", driverRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/disputes", disputeRoutes);
app.use("/api/owner", ownerRoutes);
app.use("/api/motorcycles", motorcycleRoutes);
app.use("/api/stats", statsRoutes);

// Serve HTML pages
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/dashboard.html"));
});
app.get("/driver/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/driver.html"));
});
app.get("/owner", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/owner.html"));
});

app.listen(PORT, () => {
  console.log(`MotoLift server running on port ${PORT}`);
  startScheduler();
});
