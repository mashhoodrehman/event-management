const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
// const authMiddleware = require("../middleware/authMiddleware");
const authMiddleware = require("../middleware/authMiddleware");

router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password/:token", authController.resetPassword);
router.get("/verify", authController.verifyAccount);
router.get("/profile", authMiddleware, authController.getProfile);

module.exports = router;
