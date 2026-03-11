const { Sequelize, Op } = require("sequelize");

const SMSAutomation = require("../models/smsAutomation.model");
const WhatsAppAutomation = require("../models/whatsAppAutomation.model");
const AICallAutomation = require("../models/aICallAutomation.model");
const HumanCallAutomation = require("../models/humanCallAutomation.model");
const Event = require("../models/event.model");

async function getWeeklyActivity(eventId) {
  const today = new Date();
  const weekAgo = new Date();
  weekAgo.setDate(today.getDate() - 6);

  const automationModels = {
    sms: SMSAutomation,
    whatsapp: WhatsAppAutomation,
    ai_call: AICallAutomation,
    human_call: HumanCallAutomation
  };

  const results = {};

  for (const [key, Model] of Object.entries(automationModels)) {
    const dateCol = "createdAt";
    const rows = await Model.findAll({
      attributes: [
        [Sequelize.fn("DATE", Sequelize.col(dateCol)), "date"],
        [Sequelize.fn("COUNT", Sequelize.col("id")), "count"]
      ],
      where: {
        eventId,
        'status': 'success',
        [dateCol]: {
          [Op.between]: [weekAgo, today]
        }
      },
      group: [Sequelize.fn("DATE", Sequelize.col(dateCol))],
      raw: true
    });

    results[key] = rows;
  }

  return results;
}

module.exports = { getWeeklyActivity };
