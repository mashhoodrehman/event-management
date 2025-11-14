const SMSAutomation = require("../models/smsAutomation.model");
const WhatsAppAutomation = require("../models/whatsAppAutomation.model");
const AICallAutomation = require("../models/aICallAutomation.model");
const HumanCallAutomation = require("../models/humanCallAutomation.model");
const EventAutomationSchedule = require("../models/eventAutomationSchedule.model");
const { generateSchedules } = require("./generateSchedules");

const { Op } = require("sequelize");

async function createAutomations(event, settings, guests, templates) {
  // build automations array in the expected format
  const automations = [
    {
      key: "SMS",
      enabled: !!settings.smsService,
      executionDay: settings.smsExecutionDays || 1, // user value (1-based)
      rounds: settings.smsRounds || 1,
      templateId: templates.smsTemplateId,
      eventId: event.id,
    },
    {
      key: "WhatsApp",
      enabled: !!settings.whatsappService,
      executionDay: settings.whatsappExecutionDays || 1,
      rounds: settings.whatsappRounds || 1,
      templateId: templates.whatsappTemplateId,
      eventId: event.id,
    },
    {
      key: "AI_CALL",
      enabled: !!settings.aiCallService,
      executionDay: settings.aiCallExecutionDays || 1,
      rounds: settings.aiCallRounds || 1,
      templateId: templates.aiCallTemplateId,
      eventId: event.id,
    },
    {
      key: "HUMAN_CALL",
      enabled: !!settings.humanCallService,
      executionDay: settings.humanCallExecutionDays || 1,
      rounds: settings.humanCallRounds || 1,
      templateId: templates.humanCallTemplateId,
      eventId: event.id,
    },
  ];

  const eventId = event.id;

  // automationStart should be a Date object (from event.automationStartDate)
  const automation = await EventAutomationSchedule.findOne({
    where: { eventId },
  });
  const automationStart = new Date(automation.startDateTime);
  const eventDate = new Date(event.eventDate);

  // generate all tasks
  const tasks = generateSchedules({
    guests,
    automationStart,
    eventDate,
    automations,
  });

  // Now map tasks into model bulkCreate arrays per automation table:
  const smsTasks = tasks
    .filter((t) => t.type === "SMS")
    .map((t) => ({
      guestNumber: t.guestNumber,
      templateId: t.templateId,
      status: "pending",
      scheduledAt: t.scheduledAt,
      eventId: t.eventId,
      round: t.round,
    }));

  const waTasks = tasks
    .filter((t) => t.type === "WhatsApp")
    .map((t) => ({
      guestNumber: t.guestNumber,
      templateId: t.templateId,
      status: "pending",
      scheduledAt: t.scheduledAt,
      eventId: t.eventId,
      round: t.round,
    }));
  const aiTasks = tasks
    .filter((t) => t.type === "AI_CALL")
    .map((t) => ({
      guestNumber: t.guestNumber,
      templateId: t.templateId,
      status: "pending",
      scheduledAt: t.scheduledAt,
      eventId: t.eventId,
      round: t.round,
    }));
  const humanTasks = tasks
    .filter((t) => t.type === "HUMAN_CALL")
    .map((t) => ({
      guestNumber: t.guestNumber,
      templateId: t.templateId,
      status: "pending",
      scheduledAt: t.scheduledAt,
      eventId: t.eventId,
      round: t.round,
    }));

  // similarly for AI_CALL and HUMAN_CALL...
  await SMSAutomation.bulkCreate(smsTasks);
  await WhatsAppAutomation.bulkCreate(waTasks);
  await AICallAutomation.bulkCreate(aiTasks);
  await HumanCallAutomation.bulkCreate(humanTasks);
}

module.exports = { createAutomations };
