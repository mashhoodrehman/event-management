// services/whatsapp.service.js
require("dotenv").config();
const axios = require("axios");

const RESPOND_IO_BASE_URL =
  process.env.RESPOND_IO_BASE_URL || "https://api.respond.io/v2";
const RESPOND_IO_API_TOKEN = process.env.RESPOND_IO_API_TOKEN;
const RESPOND_IO_CHANNEL_ID = process.env.RESPOND_IO_CHANNEL_ID || 159256; // fallback to your example

if (!RESPOND_IO_API_TOKEN) {
  console.warn(
    "[WhatsApp Service] RESPOND_IO_API_TOKEN is not set. WhatsApp sending will fail."
  );
}

module.exports = {
  /**
   * Send WhatsApp template message via Respond.io
   *
   * @param {string} phoneNumber - E.164 format, e.g. +972543982101
   * @param {Object} data
   * @param {string} data.name - Guest name (for {{1}})
   * @param {string} data.simId - SIM ID or any second parameter (for {{2}})
   */
  async sendWhatsAppTemplate(_phoneNumber, { _name, simId }) {
    const phoneNumber = "+972543982101";
    const name = "Dor";
    try {
      const url = `${RESPOND_IO_BASE_URL}/contact/phone:${phoneNumber}/message`;

      const requestBody = {
        message: {
          type: "whatsapp_template",
          template: {
            name: "v2v3sim_appupdate", // your approved WA template name
            languageCode: "he",
            components: [
              {
                type: "body",
                // Keep your template body text as-is, but the parameters below
                // will replace {{1}} and {{2}} with actual values.
                text: `שלום {{1}} ,\n\nמספר הסים פיזי/הדיגיטלי שברשותך: {{2}}\n\nמעכשיו תוכלו לבדוק את יתרת החבילה ולטעון בקלות – ישירות דרך האפליקציה שלנו.\n📲 להורדת האפליקציה:\nhttps://simtlv.co.il/install\n\nלאחר ההתקנה, היכנסו לאפליקציה ובחרו באפשרות "לקוח קיים".\nשם תוכלו להזין את מספר הסים ולקשר אותו לחשבון.\n📋 לצפייה בכל השלבים ולהעתקה קלה של מזהה הסים שלך – לחץ כאן:\nhttps://app-link.simtlv.co.il/partner-registration/{{2}}\n\nהשירות מאפשר לך לנהל את החשבון שלך בצורה מהירה, פשוטה וללא צורך בהמתנה לנציג.\n💬 כמובן שניתן לפנות אלינו בכל שלב דרך WhatsApp, ניתן להשיב להודעה זו.\n\nבברכה,\nצוות SIMTLV`,
                parameters: [
                  {
                    type: "text",
                    text: name, // replaces {{1}}
                  },
                  {
                    type: "text",
                    text: simId, // replaces {{2}}
                  },
                ],
              },
              {
                type: "buttons",
                buttons: [
                  {
                    type: "url",
                    text: "📲 להורדת האפליקציה",
                    url: "https://simtlv.co.il/install",
                  },
                  {
                    type: "url",
                    text: "📋 לצפייה במזהה הסים",
                    url: "https://app-link.simtlv.co.il/partner-registration/{{1}}",
                    parameters: [
                      {
                        type: "text",
                        text: simId, // will replace {{1}} in the URL
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
        channelId: RESPOND_IO_CHANNEL_ID,
      };

      console.log("📨 Sending WhatsApp via Respond.io:", {
        phoneNumber,
        name,
        simId,
      });

      const response = await axios.post(url, requestBody, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESPOND_IO_API_TOKEN}`,
        },
      });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error(
        "WhatsApp API ERROR:",
        error.response?.data || error.message
      );
      throw new Error(error.response?.data?.message || error.message);
    }
  },
};
