// services/sms.service.js
require("dotenv").config();
const axios = require("axios");
const MessageTemplate = require("../models/messageTemplate.model");

const normalizePhoneNumber = (phone) => {
  if (!phone) return phone;
  return phone.replace(/^\+/, ""); // removes only leading +
};

module.exports = {
  /**
   * Fetch dynamic message using templateId
   */
  async getMessageByTemplate(templateId, variables = {}) {
    const template = await MessageTemplate.findByPk(templateId);

    if (!template) throw new Error("Template not found");

    let message = template.messageBody || "";

    // Replace {key} with variables[key]
    message = message.replace(/{(\w+)}/g, (match, key) => {
      if (variables[key] === undefined || variables[key] === null) {
        return match; // leave {key} if not provided
      }
      return String(variables[key]);
    });

    return message;
  },

  /**
   * Send SMS via API
   */
  async sendSMS(phoneNumber, message, rsvpToken, senderName = "EVENT_APP") {
    // const phoneNumber = "+972543982101";
    try {
      // const baseUrl =
      //   process.env.FRONTEND_BASE_URL || "http://localhost:8080/rsvp";
      // const link = `${baseUrl}?token=${rsvpToken}`;
      // const finalMessage = `${message}\nRSVP here: ${link}`;
      let finalMessage = message;
      const cleanedPhoneNumber = normalizePhoneNumber(phoneNumber);

      if (rsvpToken) {
        const baseUrl =
          process.env.FRONTEND_BASE_URL || "http://localhost:8080/rsvp";
        const link = `${baseUrl}?token=${rsvpToken}`;

        // Only append if the link is not already inside the message
        if (!message.includes(link)) {
          finalMessage = `${message}\nRSVP here: ${link}`;
        }
      }
      console.log(cleanedPhoneNumber, "phone number ");
      const requestBody = {
        sms: {
          user: {
            username: process.env.SMS_API_USERNAME || "simtlv99",
          },
          source: process.env.SMS_SOURCE_NAME || "InviteNow",
          destinations: {
            phone: cleanedPhoneNumber,
          },
          message: finalMessage,
        },
      };

      console.log("📨 Sending SMS:", { phoneNumber, finalMessage });

      const response = await axios.post(
        "https://019sms.co.il/api",
        requestBody,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.SMS_API_TOKEN}`,
          },
        }
      );

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error("SMS API ERROR:", error.response?.data || error.message);
      throw new Error(error.response?.data?.message || error.message);
    }
  },
};
