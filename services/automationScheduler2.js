// services/automationScheduler.js
const SMSAutomation = require("../models/smsAutomation.model");
const WhatsAppAutomation = require("../models/whatsAppAutomation.model");
const AICallAutomation = require("../models/aICallAutomation.model");
const HumanCallAutomation = require("../models/humanCallAutomation.model");
const EventSetting = require("../models/eventSetting.model");
const { generateSchedules } = require("./generateSchedules");
const { enqueueAutomationJob } = require("../queues/automationQueue");

async function createAutomations(event, guests, templates) {
  const eventId = event.id;

  const allSteps = await EventSetting.findAll({
    where: { eventId },
    order: [
      ["executionDate", "ASC"],
      ["stepOrder", "ASC"],
      ["id", "ASC"],
    ],
  });

  if (!allSteps.length) {
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

  // 🔹 Only schedule for today & future (skip past)
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);

  const futureSteps = allSteps.filter((s) => {
    const dateKey =
      typeof s.executionDate === "string"
        ? s.executionDate
        : s.executionDate.toISOString().slice(0, 10);
    return dateKey >= todayKey;
  });

  if (!futureSteps.length) {
    console.log(
      `createAutomations: no steps for today/future for event ${eventId}`
    );
    return;
  }

  const tasks = generateSchedules({
    guests,
    steps: futureSteps,
    templates,
    eventId,
  });

  if (!tasks.length) {
    console.warn(
      `createAutomations: generateSchedules returned 0 tasks for event ${eventId}`
    );
    return;
  }

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

    // queue job to fire at scheduledAt
    await enqueueAutomationJob({
      type,
      modelName,
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
