// services/sms.service.js
require("dotenv").config();
const axios = require("axios");
const MessageTemplate = require("../models/messageTemplate.model");

module.exports = {
  /**
   * Fetch dynamic message using templateId
   */
  async getMessageByTemplate(templateId) {
    const template = await MessageTemplate.findByPk(templateId);

    if (!template) throw new Error("Template not found");

    let message = template.messageBody;

    return message;
  },

  /**
   * Send SMS via API
   */
  async sendSMS(phoneNumber, message, rsvpToken, senderName = "EVENT_APP") {
    try {
      const baseUrl =
        process.env.FRONTEND_BASE_URL || "http://localhost:8080/rsvp";
      const link = `${baseUrl}?token=${rsvpToken}`;
      const finalMessage = `${message}\nRSVP here: ${link}`;
      const requestBody = {
        sms: {
          user: {
            username: process.env.SMS_API_USERNAME || "simtlv99",
          },
          source: senderName,
          destinations: {
            phone: phoneNumber,
          },
          message: finalMessage,
        },
      };

      console.log("📨 Sending SMS:", { phoneNumber, finalMessage });

      //   const response = await axios.post(
      //     "https://019sms.co.il/api",
      //     requestBody,
      //     {
      //       headers: {
      //         "Content-Type": "application/json",
      //         Authorization: `Bearer ${process.env.SMS_API_TOKEN}`,
      //       },
      //     }
      //   );

      return {
        success: true,
        // data: response.data,
      };
    } catch (error) {
      console.error("SMS API ERROR:", error.response?.data || error.message);
      throw new Error(error.response?.data?.message || error.message);
    }
  },
};
