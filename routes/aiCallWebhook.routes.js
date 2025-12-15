const express = require("express");
const router = express.Router();

// AI Call webhook (no secret, just log + return body)
router.post("/ai-call", async (req, res) => {
  try {
    console.log("📞 AI CALL WEBHOOK RECEIVED");
    console.log("Headers:", req.headers);
    console.log("Body:", req.body);

    // ✅ Return body back to caller
    return res.status(200).json({
      success: true,
      message: "Webhook received successfully",
      receivedData: req.body,
    });
  } catch (error) {
    console.error("❌ Webhook error:", error);
    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  }
});

module.exports = router;
