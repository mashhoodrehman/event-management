// routes/servicePricing.routes.js
const express = require("express");
const router = express.Router();

const {
  getAllServices,
  updateService,
} = require("../controllers/servicePricing.controller");

const adminAuth = require("../middleware/adminAuth");

// ✅ Get all services (admin)
router.get("/", adminAuth, getAllServices);

// ✅ Update price/description only (admin)
router.post("/:id/update", adminAuth, updateService);

module.exports = router;
