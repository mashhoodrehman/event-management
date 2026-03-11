const express = require("express");
const router = express.Router();

// AI Call webhook (no secret, just log + return body)
router.post("/ai-call", async (req, res) => {
  try {
    console.log("📞 AI CALL WEBHOOK RECEIVED");
    console.log("Headers:", req.headers);
    console.log("Body:", req.body);

    const {
      name,
      customer_id,
      event_id,
      phone,
      id, 
      answer,
    } = req.body;

    if (!customer_id || customer_id === "Unknown") {
      console.warn(`Invalid customer_id: ${customer_id}`);
      return res.status(400).json({
        success: false,
        message: "Invalid customer_id",
      });
    }

    // fetch guest by customer_id
    const Guest = require("../models/guest.model");
    const guest = await Guest.findOne({
      where: { id: customer_id },
    });

    if (!guest) {
      console.warn(`Guest not found for customer_id ${customer_id}`);
      return res.status(404).json({
        success: false,
        message: "Guest not found",
      });
    }


    if (answer && answer.status) {
      const answerStatus = answer.status.toLowerCase();
      const guestCount = answer.guests || 0;

      switch (answerStatus) {
        case "yes":
          guest.status = "confirmed";
          guest.guestCount = guestCount;
          break;

        case "no":
          guest.status = "cancel";
          guest.guestCount = 0;
          break;

        case "maybe":
        case "hesitate":
          guest.status = "hesitate";
          guest.guestCount = guestCount;
          break;

        default:
          console.warn(`Unknown answer status: ${answer.status}`);
      }

      await guest.save();
      console.log(
        `Guest ${guest.name} updated: status=${guest.status}, count=${guest.guestCount}`
      );
    }

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
