const express = require("express");
const router = express.Router();
const deviceController = require("../controllers/device.controller");
const authMiddleware = require("../middleware/authMiddleware");

// Website routes
router.post("/create", authMiddleware, deviceController.createDevice);
router.get("/:eventId", authMiddleware, deviceController.getDevicesByEvent);
router.delete("/:id", authMiddleware, deviceController.deleteDevice);
router.post("/status", authMiddleware, deviceController.checkDeviceStatuses);

// Mobile app routes (no auth required as per requirements)
router.post("/pair", deviceController.pairDevice);
router.post("/contacts/upload", deviceController.uploadContacts);

module.exports = router;
