require("dotenv").config();
const axios = require("axios");
const MessageTemplate = require("../models/messageTemplate.model");

// 🔹 GREEN API CONFIG
const GREEN_API_URL =
  "https://7105.api.greenapi.com/waInstance7105436288/sendMessage/26aa249c79cd41be8bf2772cf14b3850f169e8e0a316443b9f";

// 3 FREE whitelisted numbers
const WHITELISTED_NUMBERS = [
  "3061435349@c.us",
  "3234895958@c.us",
  "3427306848@c.us"
];

function phoneToWhatsAppId(phoneNumber) {
  // Remove all non-digits and leading +
  let cleaned = phoneNumber.replace(/\D/g, '');

  // Remove leading + or 00
  if (cleaned.startsWith('00')) cleaned = cleaned.substring(2);

  return `${cleaned}@c.us`;
}

function isWhitelisted(chatId) {
  return WHITELISTED_NUMBERS.includes(chatId);
}

/**
 * Build PUBLIC RSVP link
 */
function buildRsvpLink(rsvpToken, via = null) {
  const base =
    (process.env.FRONTEND_BASE_URL || "").trim() ||
    "https://yourdomain.com/rsvp";

  const baseUrl = base.replace(/\/+$/, "");
  let link = `${baseUrl}?token=${encodeURIComponent(String(rsvpToken))}`;
  if (via) {
    link += `&via=${via}`;
  }
  return link;
}

module.exports = {
  /**
   * Get WhatsApp message from template
   */
  async getMessageByTemplate(templateId, variables = {}) {
    const template = await MessageTemplate.findByPk(templateId);
    if (!template) throw new Error("Template not found");

    let message = (template.messageBody || "").trim();
    message = message.replace(/{(\w+)}/g, (_, key) => variables[key] ?? "");

    return message.trim();
  },

  /**
   * Send WhatsApp - ONLY to whitelisted numbers (free account)
   */
  async sendWhatsAppTemplate(guestNumber, message, rsvpToken) {
    try {
      if (!rsvpToken) {
        throw new Error("RSVP token is required");
      }

      // Convert phone to WhatsApp format
      const chatId = phoneToWhatsAppId(guestNumber);

      // 🔥 CHECK IF WHITELISTED
      if (!isWhitelisted(chatId)) {
        console.warn(
          `⚠️ SKIPPED: ${guestNumber} (${chatId}) is not whitelisted.`
        );
        console.log(`   Only these numbers can receive messages on free plan:`);
        console.log(`   - 3061435349`);
        console.log(`   - 3207622923`);
        console.log(`   - 923207622923`);

        // ✅ Don't send, just return success (skip silently)
        return {
          success: true,
          skipped: true,
          reason: 'not_whitelisted',
          number: guestNumber
        };
      }

      // ✅ Number IS whitelisted - send the message!
      return await this._sendMessage(chatId, message, rsvpToken);

    } catch (error) {
      console.error(
        "❌ WhatsApp Error:",
        error.response?.data || error.message
      );
      throw error;
    }
  },

  /**
   * Internal method to actually send the message
   */
  async _sendMessage(chatId, message, rsvpToken) {
    const rsvpLink = buildRsvpLink(rsvpToken, "whatsapp");

    const finalMessage = `${message}

✅ RSVP Link:
${rsvpLink}`;

    const requestBody = {
      chatId: chatId,
      message: finalMessage,
    };

    console.log("📨 Sending WhatsApp to:", chatId);

    const response = await axios.post(GREEN_API_URL, requestBody, {
      headers: { "Content-Type": "application/json" },
    });

    console.log("✅ Message sent successfully!");

    return {
      success: true,
      data: response.data,
      recipient: chatId
    };
  },

  /**
   * Get account status
   */
  async getAccountStatus() {
    try {
      const statusUrl = GREEN_API_URL.replace('/sendMessage/', '/getStateInstance/');
      const response = await axios.get(statusUrl);
      return response.data;
    } catch (error) {
      console.error("Failed to get account status:", error.message);
      return null;
    }
  },

  async sendExternalWhatsApp(phoneNumber, message) {
    try {
      const EXTERNAL_API_URL = "https://invitenow-whatsapp-api.revuity.com/api/whatsapp/send";

      const requestBody = {
        contact: [
          {
            number: phoneNumber,
            message: message,
            sms_type: "plain"
          }
        ]
      };

      console.log("📨 Sending via External WhatsApp API to:", phoneNumber);

      const response = await axios.post(EXTERNAL_API_URL, requestBody, {
        headers: {
          "Content-Type": "application/json",
          "Api-key": process.env.EXTERNAL_WHATSAPP_API_KEY || "b52dcc52-4828-44c5-b0c7-54ef96d37d82"
        },
      });

      console.log("✅ External API response:", response.data);

      return {
        success: true,
        data: response.data,
        recipient: phoneNumber
      };
    } catch (error) {
      console.error(
        "❌ External WhatsApp API Error:",
        error.response?.data || error.message
      );
      throw error;
    }
  }
};