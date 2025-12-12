require("dotenv").config();
const axios = require("axios");

const idInstance = process.env.GREEN_ID_INSTANCE; // e.g. 7105420574
const apiToken = process.env.GREEN_API_TOKEN; // long token
const apiUrl = process.env.GREEN_API_URL || "https://7105.api.greenapi.com";

const webhookPublicUrl = process.env.GREEN_WEBHOOK_URL; // e.g. https://yourdomain.com/api/webhooks/greenapi
const webhookToken = process.env.GREEN_WEBHOOK_TOKEN; // any secret string you choose

async function setSettings() {
  const url = `${apiUrl}/waInstance${idInstance}/setSettings/${apiToken}`;

  const body = {
    webhookUrl: webhookPublicUrl,
    webhookUrlToken: webhookToken, // optional but recommended
    outgoingWebhook: true,
    outgoingMessageWebhook: true,
    outgoingAPIMessageWebhook: true,
  };

  const res = await axios.post(url, body, {
    headers: { "Content-Type": "application/json" },
  });
  console.log("✅ SetSettings response:", res.data);
}

setSettings().catch((e) => {
  console.error("❌ SetSettings error:", e.response?.data || e.message);
});
