// services/automationScheduler.js
const SMSAutomation = require("../models/smsAutomation.model");
const WhatsAppAutomation = require("../models/whatsAppAutomation.model");
const AICallAutomation = require("../models/aICallAutomation.model");
const HumanCallAutomation = require("../models/humanCallAutomation.model");
const EventSetting = require("../models/eventSetting.model");
const { generateSchedules } = require("./generateSchedules");
const { enqueueAutomationJob } = require("../queues/automationQueue");

/**
 * Create automation tasks AFTER payment succeeds.
 *
 * event: Event instance
 * guests: Guest[]
 * templates: {
 *   smsTemplateId,
 *   whatsappTemplateId,
 *   aiCallTemplateId,
 *   humanCallTemplateId
 * }
 */
async function createAutomations(event, guests, templates) {
  const eventId = event.id;

  // 1) load all steps for this event
  const steps = await EventSetting.findAll({
    where: { eventId },
    order: [
      ["executionDate", "ASC"],
      ["stepOrder", "ASC"],
      ["id", "ASC"],
    ],
  });

  if (!steps.length) {
    console.warn(
      `createAutomations: no EventSetting steps found for event ${eventId}`
    );
    return;
  }

  if (!Array.isArray(guests) || guests.length === 0) {
    console.warn(
      `createAutomations: no guests found for event ${eventId}, nothing to schedule`
    );
    return;
  }

  // 2) generate tasks (with 4 second spacing + correct order per date)
  const tasks = generateSchedules({
    guests,
    steps,
    templates,
    eventId,
  });

  if (!tasks.length) {
    console.warn(
      `createAutomations: generateSchedules returned 0 tasks for event ${eventId}`
    );
    return;
  }

  // 3) persist & enqueue per channel
  // we create each record individually so we have its id for queue
  const createAndEnqueue = async (Model, modelName, type, t) => {
    const rec = await Model.create({
      guestNumber: t.guestNumber,
      rsvpToken: t.rsvpToken,
      templateId: t.templateId,
      status: "pending",
      scheduledAt: t.scheduledAt,
      eventId: t.eventId,
      round: t.round,
    });

    await enqueueAutomationJob({
      type,
      modelName, // 'sms' | 'whatsapp' | 'ai' | 'human'
      taskId: rec.id,
      scheduledAt: t.scheduledAt,
    });
  };

  const smsTasks = tasks.filter((t) => t.type === "SMS");
  const waTasks = tasks.filter((t) => t.type === "WhatsApp");
  const aiTasks = tasks.filter((t) => t.type === "AI_CALL");
  const humanTasks = tasks.filter((t) => t.type === "HUMAN_CALL");

  for (const t of smsTasks) {
    await createAndEnqueue(SMSAutomation, "sms", "SMS", t);
  }
  for (const t of waTasks) {
    await createAndEnqueue(WhatsAppAutomation, "whatsapp", "WhatsApp", t);
  }
  for (const t of aiTasks) {
    await createAndEnqueue(AICallAutomation, "ai", "AI_CALL", t);
  }
  for (const t of humanTasks) {
    await createAndEnqueue(HumanCallAutomation, "human", "HUMAN_CALL", t);
  }

  console.log(
    `createAutomations: created & queued ${tasks.length} tasks for event ${eventId}`
  );
}

module.exports = { createAutomations };

///////////////////////////////////////////////////////////
// const SMSAutomation = require("../models/smsAutomation.model");
// const WhatsAppAutomation = require("../models/whatsAppAutomation.model");
// const AICallAutomation = require("../models/aICallAutomation.model");
// const HumanCallAutomation = require("../models/humanCallAutomation.model");
// const EventAutomationSchedule = require("../models/eventAutomationSchedule.model");
// const { generateSchedules } = require("./generateSchedules");

// const { Op } = require("sequelize");

// async function createAutomations(event, settings, guests, templates) {
//   // build automations array in the expected format
//   const automations = [
//     {
//       key: "SMS",
//       enabled: !!settings.smsService,
//       executionDay: settings.smsExecutionDays || 1, // user value (1-based)
//       rounds: settings.smsRounds || 1,
//       templateId: templates.smsTemplateId,
//       eventId: event.id,
//     },
//     {
//       key: "WhatsApp",
//       enabled: !!settings.whatsappService,
//       executionDay: settings.whatsappExecutionDays || 1,
//       rounds: settings.whatsappRounds || 1,
//       templateId: templates.whatsappTemplateId,
//       eventId: event.id,
//     },
//     {
//       key: "AI_CALL",
//       enabled: !!settings.aiCallService,
//       executionDay: settings.aiCallExecutionDays || 1,
//       rounds: settings.aiCallRounds || 1,
//       templateId: templates.aiCallTemplateId,
//       eventId: event.id,
//     },
//     {
//       key: "HUMAN_CALL",
//       enabled: !!settings.humanCallService,
//       executionDay: settings.humanCallExecutionDays || 1,
//       rounds: settings.humanCallRounds || 1,
//       templateId: templates.humanCallTemplateId,
//       eventId: event.id,
//     },
//   ];

//   const eventId = event.id;

//   // automationStart should be a Date object (from event.automationStartDate)
//   const automation = await EventAutomationSchedule.findOne({
//     where: { eventId },
//   });
//   const automationStart = new Date(automation.startDateTime);
//   const eventDate = new Date(event.eventDate);

//   // generate all tasks
//   const tasks = generateSchedules({
//     guests,
//     automationStart,
//     eventDate,
//     automations,
//   });

//   // Now map tasks into model bulkCreate arrays per automation table:
//   const smsTasks = tasks
//     .filter((t) => t.type === "SMS")
//     .map((t) => ({
//       guestNumber: t.guestNumber,
//       rsvpToken: t.rsvpToken,
//       templateId: t.templateId,
//       status: "pending",
//       scheduledAt: t.scheduledAt,
//       eventId: t.eventId,
//       round: t.round,
//     }));

//   const waTasks = tasks
//     .filter((t) => t.type === "WhatsApp")
//     .map((t) => ({
//       guestNumber: t.guestNumber,
//       rsvpToken: t.rsvpToken,
//       templateId: t.templateId,
//       status: "pending",
//       scheduledAt: t.scheduledAt,
//       eventId: t.eventId,
//       round: t.round,
//     }));
//   const aiTasks = tasks
//     .filter((t) => t.type === "AI_CALL")
//     .map((t) => ({
//       guestNumber: t.guestNumber,
//       rsvpToken: t.rsvpToken,
//       templateId: t.templateId,
//       status: "pending",
//       scheduledAt: t.scheduledAt,
//       eventId: t.eventId,
//       round: t.round,
//     }));
//   const humanTasks = tasks
//     .filter((t) => t.type === "HUMAN_CALL")
//     .map((t) => ({
//       guestNumber: t.guestNumber,
//       rsvpToken: t.rsvpToken,
//       templateId: t.templateId,
//       status: "pending",
//       scheduledAt: t.scheduledAt,
//       eventId: t.eventId,
//       round: t.round,
//     }));

//   // similarly for AI_CALL and HUMAN_CALL...
//   await SMSAutomation.bulkCreate(smsTasks);
//   await WhatsAppAutomation.bulkCreate(waTasks);
//   await AICallAutomation.bulkCreate(aiTasks);
//   await HumanCallAutomation.bulkCreate(humanTasks);
// }

// module.exports = { createAutomations };
