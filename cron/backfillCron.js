const cron = require("node-cron");
const { Op } = require("sequelize");
const Guest = require("../models/guest.model");
const Event = require("../models/event.model");
const MessageTemplate = require("../models/messageTemplate.model");
const { createAutomations } = require("../services/automationScheduler");

/**
 * Find guests who were skipped because of missing phone number,
 * but now have one, and schedule automations for them.
 */
async function backfillSkippedGuests() {
  try {
    // Find guests who were 'skipped' (no phone at trigger time) but now have a phone number.
    const guestsToProcess = await Guest.findAll({
      where: {
        processStatus: "skipped",
        phone: { [Op.ne]: null },
      },
      include: [Event],
    });

    if (!guestsToProcess.length) return;

    console.log(`[Backfill Cron] Found ${guestsToProcess.length} skipped guests with phone numbers. Processing...`);

    // Group by eventId to minimize template fetches
    const byEvent = guestsToProcess.reduce((acc, g) => {
      if (!acc[g.eventId]) acc[g.eventId] = { event: g.Event, guests: [] };
      acc[g.eventId].guests.push(g);
      return acc;
    }, {});

    for (const [eventId, data] of Object.entries(byEvent)) {
      const { event, guests } = data;
      if (!event) continue;

      const template = await MessageTemplate.findOne({ where: { eventId } });
      const templates = {
        smsTemplateId: template?.id || null,
        whatsappTemplateId: template?.id || null,
        aiCallTemplateId: template?.id || null,
        humanCallTemplateId: template?.id || null,
      };

      await createAutomations(event, guests, templates);
      console.log(`[Backfill Cron] Successfully processed ${guests.length} backfilled guests for event ${eventId}`);
    }
  } catch (err) {
    console.error("[Backfill Cron] Error:", err);
  }
}

// Run every minute
cron.schedule("* * * * *", async () => {
    console.log("[Backfill Cron] Checking for skipped guests...", new Date());
    await backfillSkippedGuests();
});

module.exports = { backfillSkippedGuests };
