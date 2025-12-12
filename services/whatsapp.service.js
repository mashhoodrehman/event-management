// services/whatsapp.service.js
require("dotenv").config();
const axios = require("axios");
const MessageTemplate = require("../models/messageTemplate.model");

// 🔹 GREEN API CONFIG (HARDCODED AS REQUESTED)
const GREEN_API_URL =
  "https://7105.api.greenapi.com/waInstance7105420574/sendMessage/115cbe965e8a4d0fb36c6e0949cc23cc7d561b0c52114fecaf";

// 🔹 HARD CODED PAKISTAN NUMBER
const HARD_CODED_CHAT_ID = "923324505905@c.us";

module.exports = {
  /**
   * Get message body from template & replace variables
   */
  async getMessageByTemplate(templateId, variables = {}) {
    const template = await MessageTemplate.findByPk(templateId);

    if (!template) throw new Error("Template not found");

    let message = template.messageBody || "";

    // Replace {key} with variables[key]
    message = message.replace(/{(\w+)}/g, (match, key) => {
      if (variables[key] === undefined || variables[key] === null) {
        return match;
      }
      return String(variables[key]);
    });

    return message;
  },

  /**
   * Send WhatsApp message via Green-API
   */
  async sendWhatsAppTemplate(message, rsvpToken) {
    try {
      let finalMessage = message;

      // 🔹 Append RSVP link if provided
      if (rsvpToken) {
        const baseUrl =
          process.env.FRONTEND_BASE_URL || "http://localhost:8080/rsvp";
        const link = `${baseUrl}?token=${rsvpToken}`;

        if (!finalMessage.includes(link)) {
          finalMessage += `\n\nRSVP here: ${link}`;
        }
      }

      const requestBody = {
        chatId: HARD_CODED_CHAT_ID,
        message: finalMessage,
      };

      console.log("📨 Sending WhatsApp via Green-API:", requestBody);

      const response = await axios.post(GREEN_API_URL, requestBody, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error(
        "❌ Green-API ERROR:",
        error.response?.data || error.message
      );
      throw new Error(error.response?.data?.message || error.message);
    }
  },
};

// // services/whatsapp.service.js
// require("dotenv").config();
// const axios = require("axios");
// const MessageTemplate = require("../models/messageTemplate.model");

// const RESPOND_IO_BASE_URL =
//   process.env.RESPOND_IO_BASE_URL || "https://api.respond.io/v2";
// const RESPOND_IO_API_TOKEN = process.env.RESPOND_IO_API_TOKEN;
// const RESPOND_IO_CHANNEL_ID = process.env.RESPOND_IO_CHANNEL_ID || 159256; // fallback to your example

// if (!RESPOND_IO_API_TOKEN) {
//   console.warn(
//     "[WhatsApp Service] RESPOND_IO_API_TOKEN is not set. WhatsApp sending will fail."
//   );
// }

// module.exports = {
//   /**
//    * Send WhatsApp template message via Respond.io
//    *
//    * @param {string} phoneNumber - E.164 format, e.g. +972543982101
//    * @param {Object} data
//    * @param {string} data.name - Guest name (for {{1}})
//    * @param {string} data.simId - SIM ID or any second parameter (for {{2}})
//    */

//   async getMessageByTemplate(templateId, variables = {}) {
//     const template = await MessageTemplate.findByPk(templateId);

//     if (!template) throw new Error("Template not found");

//     let message = template.messageBody || "";

//     // Replace {key} with variables[key]
//     message = message.replace(/{(\w+)}/g, (match, key) => {
//       if (variables[key] === undefined || variables[key] === null) {
//         return match; // leave {key} if not provided
//       }
//       return String(variables[key]);
//     });

//     return message;
//   },
//   async sendWhatsAppTemplate(phoneNumber, message, rsvpToken) {
//     try {
//       const url = `${RESPOND_IO_BASE_URL}/contact/phone:${phoneNumber}/message`;

//       let finalMessage = message;

//       if (rsvpToken) {
//         const baseUrl =
//           process.env.FRONTEND_BASE_URL || "http://localhost:8080/rsvp";
//         const link = `${baseUrl}?token=${rsvpToken}`;

//         // Only append if the link is not already inside the message
//         if (!message.includes(link)) {
//           finalMessage = `${message}\nRSVP here: ${link}`;
//         }
//       }

//       const requestBody = {
//         message: {
//           type: "whatsapp_template",
//           template: {
//             name: "v2v3sim_appupdate", // your approved WA template name
//             languageCode: "he",
//             components: [
//               {
//                 type: "body",
//                 // Keep your template body text as-is, but the parameters below
//                 // will replace {{1}} and {{2}} with actual values.
//                 text: finalMessage,
//                 // parameters: [
//                 //   {
//                 //     type: "text",
//                 //     text: name, // replaces {{1}}
//                 //   },
//                 //   {
//                 //     type: "text",
//                 //     text: simId, // replaces {{2}}
//                 //   },
//                 // ],
//               },
//             ],
//           },
//         },
//         channelId: RESPOND_IO_CHANNEL_ID,
//       };

//       console.log("📨 Sending WhatsApp via Respond.io:", finalMessage);

//       // const response = await axios.post(url, requestBody, {
//       //   headers: {
//       //     "Content-Type": "application/json",
//       //     Authorization: `Bearer ${RESPOND_IO_API_TOKEN}`,
//       //   },
//       // });

//       return {
//         success: true,
//         // data: response.data,
//       };
//     } catch (error) {
//       console.error(
//         "WhatsApp API ERROR:",
//         error.response?.data || error.message
//       );
//       throw new Error(error.response?.data?.message || error.message);
//     }
//   },
// };
