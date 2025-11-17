const cron = require("node-cron");
const { Op } = require("sequelize"); // << add this
const SMSAutomation = require("../models/smsAutomation.model");
const WhatsAppAutomation = require("../models/whatsAppAutomation.model");
const AICallAutomation = require("../models/aICallAutomation.model");
const HumanCallAutomation = require("../models/humanCallAutomation.model");
const smsService = require("../services/sms.service");
// You can add WhatsApp, AI, Human Call helpers similarly

/**
 * Execute due tasks for a given model
 */
async function processAutomation(model, type) {
  const now = new Date();
  const tasks = await model.findAll({
    where: {
      scheduledAt: { [Op.lte]: now },
      status: "pending",
    },
  });

  for (const task of tasks) {
    try {
      switch (type) {
        case "SMS":
          if (task.guestNumber) {
            // 1. get message using template ID
            const message = await smsService.getMessageByTemplate(
              task.templateId,
              {
                name: task.guestName, // if needed
                eventDate: task.eventDate,
              }
            );

            // 2. send the SMS
            await smsService.sendSMS(
              task.guestNumber,
              message,
              task.rsvpToken,
              task.senderName
            );

            console.log(`SMS sent to ${task.guestNumber}`);
          }
          break;
        case "WhatsApp":
          console.log(`WhatsApp sent to ${task.guestNumber}`);
          break;
        case "AI_CALL":
          console.log(`AI call triggered for ${task.guestNumber}`);
          break;
        case "HUMAN_CALL":
          console.log(`Human call triggered for ${task.guestNumber}`);
          break;
      }

      task.status = "success";
      await task.save();
    } catch (err) {
      console.error(`Failed to execute ${type} for ${task.guestNumber}:`, err);
      task.status = "failed";
      await task.save();
    }
  }
}

/**
 * Cron job to run every minute
 */
cron.schedule("* * * * *", async () => {
  console.log("Running automation cron job...", new Date());

  await processAutomation(SMSAutomation, "SMS");
  await processAutomation(WhatsAppAutomation, "WhatsApp");
  await processAutomation(AICallAutomation, "AI_CALL");
  await processAutomation(HumanCallAutomation, "HUMAN_CALL");
});
