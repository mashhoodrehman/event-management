// services/automationScheduler.js
const SMSAutomation = require("../models/smsAutomation.model");
const WhatsAppAutomation = require("../models/whatsAppAutomation.model");
const AICallAutomation = require("../models/aICallAutomation.model");
const HumanCallAutomation = require("../models/humanCallAutomation.model");
const EventSetting = require("../models/eventSetting.model");
const { generateSchedules } = require("./generateSchedules");
const { enqueueAutomationJob } = require("../queues/automationQueue");

// 👇 Generic helper: create tasks & enqueue for a given list of steps
async function createAutomationsForSteps(event, guests, templates, steps) {
  const eventId = event.id;

  if (!steps || !steps.length) return;
  if (!Array.isArray(guests) || !guests.length) {
    console.warn(
      `createAutomationsForSteps: no guests for event ${eventId}, skipping`
    );
    return;
  }

  // generateSchedules expects: { guests, steps, templates, eventId }
  const tasks = generateSchedules({
    guests,
    steps,
    templates,
    eventId,
  });

  if (!tasks.length) {
    console.warn(
      `createAutomationsForSteps: generateSchedules returned 0 tasks for event ${eventId}`
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

    await enqueueAutomationJob({
      type, // "SMS" | "WhatsApp" | ...
      modelName, // "sms" | "whatsapp" | "ai" | "human"
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
    `createAutomationsForSteps: created & queued ${tasks.length} tasks for event ${eventId}`
  );
}

// 👇 Main function: ONLY future steps (date > today)
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
      `createAutomations: no EventSetting rows found for event ${eventId}`
    );
    return;
  }

  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10); // "YYYY-MM-DD"

  // 👉 only FUTURE steps (strictly after today)
  const futureSteps = allSteps.filter((s) => {
    const dateKey =
      typeof s.executionDate === "string"
        ? s.executionDate
        : s.executionDate.toISOString().slice(0, 10);
    return dateKey > todayKey;
  });

  if (!futureSteps.length) {
    console.log(
      `createAutomations: no future steps (date > today) for event ${eventId}`
    );
    return;
  }

  await createAutomationsForSteps(event, guests, templates, futureSteps);
}

module.exports = { createAutomations, createAutomationsForSteps };
