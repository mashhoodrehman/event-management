const express = require("express");
const router = express.Router();
const deviceController = require("../controllers/device.controller");

// Website routes (should probably have auth middleware in main app.js)
router.post("/create", deviceController.createDevice);
router.get("/:eventId", deviceController.getDevicesByEvent);
router.delete("/:id", deviceController.deleteDevice);

// Mobile app routes (no auth required as per requirements)
router.post("/pair", deviceController.pairDevice);
router.post("/contacts/upload", deviceController.uploadContacts);

module.exports = router;
