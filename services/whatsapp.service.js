require("dotenv").config();
const axios = require("axios");
const { withRetry } = require("../utils/retry");
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

  /**
   * Send a message via the bot send endpoint with autoReply
   * @param {string} phoneNumber - recipient phone (with or without +)
   * @param {string} message - invitation message text
   * @param {number|string} eventId - used to build botName rsvp-bot-{eventId}
   * @param {string} eventName - used in autoReply confirmation message
   */
  async sendBotMessage(phoneNumber, message, eventId, eventName = "") {
    const BOT_SEND_URL = "https://invitenow-qr.revuity.com/bot/send?id=mmrtest";
    const botName = `rsvp-bot-${eventId}-`;
    const receiver = String(phoneNumber).replace(/^\+/, ""); // strip leading +

    const requestBody = {
      receiver,
      message,
      botName,
      autoReply: true,
      replyMessages: {
        "כן": `מעולה, רשמנו! נתראה ב ${eventName || "האירוע"} 🎉`,
        "לא": "חבל, נתראה בשמחות! ❤️",
        "אולי": "אין בעיה, נדבר בהמשך לעדכון. 👍"
      }
    };

    console.log(`📨 Sending bot message via ${botName} to: ${phoneNumber}`);

    try {
      const response = await withRetry(async () => {
        return await axios.post(BOT_SEND_URL, requestBody, {
          headers: { "Content-Type": "application/json" },
          timeout: 30000,
        });
      });

      console.log("✅ Bot send response:", response.data);
      return response.data;
    } catch (error) {
      console.error(`❌ Bot send timed out for ${receiver} (${botName}) after retries`, error.message);
      throw error;
    }
  },

  /**
   * Send a WhatsApp message via bot with autoReply replyMessages
   * (same format as the cardcom webhook bot config)
   * @param {string} phoneNumber - recipient phone
   * @param {string} message - invitation/device text to send
   * @param {object} options - { eventId, eventName } for autoReply messages
   */
  async sendExternalWhatsApp(phoneNumber, message) {
    const EXTERNAL_API_URL = "https://invitenow-whatsapp-api.revuity.com/api/whatsapp/send";

    try {
      const requestBody = {
        contact: [
          {
            number: phoneNumber,
            message: message || "היי! האם אתם מגיעים לאירוע? \n\n1. כן, מגיעים\n2. לא, לא נוכל להגיע\n3. אולי",
            sms_type: "plain"
          }
        ]
      };

      console.log("📨 Sending via External WhatsApp API to:", phoneNumber);

      const response = await withRetry(async () => {
        return await axios.post(EXTERNAL_API_URL, requestBody, {
          headers: {
            "Content-Type": "application/json",
            "Api-key": process.env.EXTERNAL_WHATSAPP_API_KEY || "b52dcc52-4828-44c5-b0c7-54ef96d37d82"
          },
          timeout: 30000,
        });
      });

      console.log("✅ External API response:", response.data);

      return {
        success: true,
        data: response.data,
        recipient: phoneNumber
      };
    } catch (error) {
      const isTimeout = error.code === "ETIMEDOUT" || error.code === "ECONNABORTED";
      console.error(
          isTimeout
              ? `❌ External WhatsApp API timed out for ${phoneNumber} — server unreachable at ${EXTERNAL_API_URL} after retries`
              : `❌ External WhatsApp API Error for ${phoneNumber}:`,
          error.response?.data || error.message
      );
      throw error;
    }
  }
};