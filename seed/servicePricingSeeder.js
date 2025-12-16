// seed/servicePricingSeeder.js
const ServicePricing = require("../models/servicePricing.model");

async function seedServicePricing() {
  const defaults = [
    {
      key: "registration_fee",
      name: "Registration Fee",
      priceAgorot: 10000, // ₪100.00
      description: "One-time setup fee per event (charged before scheduling).",
    },
    {
      key: "sms_fee",
      name: "SMS Fee",
      priceAgorot: 15, // ₪0.15
      description: "Charged per SMS automation send.",
    },
    {
      key: "whatsapp_fee",
      name: "WhatsApp Fee",
      priceAgorot: 25, // ₪0.25
      description: "Charged per WhatsApp automation send.",
    },
    {
      key: "ai_call_fee",
      name: "AI Call Fee",
      priceAgorot: 250, // ₪2.50
      description: "Charged per AI call automation.",
    },
    {
      key: "human_call_fee",
      name: "Human Call Fee",
      priceAgorot: 1500, // ₪15.00
      description: "Charged per human call automation.",
    },
  ];

  for (const row of defaults) {
    const existing = await ServicePricing.findOne({ where: { key: row.key } });

    if (!existing) {
      await ServicePricing.create(row);
    }
  }

  console.log("✅ ServicePricing seeded");
}

module.exports = seedServicePricing;
