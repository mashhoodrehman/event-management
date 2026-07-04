// controllers/agentHumanCalls.controller.js
const { Op } = require("sequelize");
const HumanCallAutomation = require("../models/humanCallAutomation.model");
const Guest = require("../models/guest.model");
const Event = require("../models/event.model");
const cardcomService = require("../services/cardcom.service");

const Payment = require("../models/payment.model");
const User = require("../models/user.model");

const SMSAutomation = require("../models/smsAutomation.model");
const WhatsAppAutomation = require("../models/whatsAppAutomation.model");
const AICallAutomation = require("../models/aICallAutomation.model");

exports.getHumanCalls = async (req, res) => {
  try {
    const status = (req.query.status || "pending").toLowerCase(); // pending | completed
    const now = new Date();

    const where = {
      billingPaymentId: { [Op.not]: null }, // ✅ only paid / ready
    };

    if (status === "pending") {
      where.status = "pending";
      where.scheduledAt = { [Op.lte]: now }; // ✅ due now
    } else {
      // completed / anything else => success + failed
      where.status = { [Op.in]: ["success", "failed"] };
    }

    const calls = await HumanCallAutomation.findAll({
      where,
      order: [["scheduledAt", "ASC"]],
    });

    if (!calls.length) {
      return res.status(200).json({ calls: [] });
    }

    // attach guest + event info
    const tokens = calls.map((c) => c.rsvpToken).filter(Boolean);

    const guestWhere = {
      rsvpToken: { [Op.in]: tokens },
    };

    // ✅ exclude confirmed guests from pending list
    if (status === "pending") {
      guestWhere.status = { [Op.ne]: "confirmed" };
    }

    const guests = await Guest.findAll({
      where: guestWhere,
      include: [
        { model: Event, attributes: ["id", "name", "eventDate", "location"] },
      ],
    });

    const guestByToken = new Map(guests.map((g) => [g.rsvpToken, g]));

    const result = calls
      .map((c) => {
        const g = guestByToken.get(c.rsvpToken);

        // ✅ if pending + guest is confirmed OR guest not found (filtered out), hide it
        if (status === "pending" && (!g || g.status === "confirmed")) {
          return null;
        }

        return {
          id: c.id,
          eventId: c.eventId,
          scheduledAt: c.scheduledAt,
          automationStatus: c.status,
          billingPaymentId: c.billingPaymentId,
          templateId: c.templateId ?? null,
          round: c.round ?? null,

          guest: g
            ? {
              id: g.id,
              name: g.name,
              phone: g.phone,
              status: g.status,
              peopleCount: g.peopleCount,
              rsvpToken: g.rsvpToken,
            }
            : null,

          event: g?.Event
            ? {
              id: g.Event.id,
              name: g.Event.name,
              eventDate: g.Event.eventDate,
              location: g.Event.location,
            }
            : null,
        };
      })
      .filter(Boolean);

    return res.status(200).json({ calls: result });
  } catch (e) {
    console.error("getHumanCalls:", e);
    return res.status(500).json({ error: "Server error" });
  }
};

function mapResultToGuestStatus(result) {
  switch (result) {
    case "confirmed":
      return "confirmed";
    case "hesitate":
      return "hesitate";
    case "cancel":
      return "cancel";
    case "no_answer":
      return null; // guest stays pending
    default:
      return null;
  }
}

async function chargeHumanCallFee({ event, user, humanCallTaskId }) {
  // ✅ you can load from ServicePricing table if you have it.
  // For now use env (agorot). Example: 1500 = ₪15
  const HUMAN_CALL_PRICE = parseInt(
    process.env.HUMANCALL_PRICE_AGOROT || "1500",
    10
  );

  if (!user?.cardcomToken) throw new Error("User missing cardcomToken");

  const result = await cardcomService.chargeToken({
    amount: HUMAN_CALL_PRICE / 100, // Cardcom takes ILS
    token: user.cardcomToken,
    eventId: event.id,
    description: `Human call fee for event #${event.id}`,
  });

  const payment = await Payment.create({
    eventId: event.id,
    amount: HUMAN_CALL_PRICE,
    currency: "ils",
    paymentIntentId: result.transactionId || "N/A",
    type: "human_call_fee",
    status: result.success ? "succeeded" : "failed",
  });

  if (!result.success) {
    throw new Error(`Payment failed: ${result.errorDescription}`);
  }

  return payment;
}

exports.submitHumanCallResult = async (req, res) => {
  try {
    const { id } = req.params; // HumanCallAutomation id
    const { result, peopleCount = 1, note } = req.body;

    if (!["confirmed", "hesitate", "cancel", "no_answer"].includes(result)) {
      return res.status(400).json({ error: "Invalid result" });
    }

    const task = await HumanCallAutomation.findByPk(id);
    if (!task) return res.status(404).json({ error: "Task not found" });

    // must be pending to submit
    if (task.status !== "pending") {
      return res.status(400).json({ error: "Task already completed" });
    }

    // guest
    const guest = await Guest.findOne({ where: { rsvpToken: task.rsvpToken } });
    if (!guest) return res.status(404).json({ error: "Guest not found" });

    // event & user
    const event = await Event.findByPk(task.eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const user = await User.findByPk(event.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // ✅ If result updates guest status
    const newGuestStatus = mapResultToGuestStatus(result);
    if (newGuestStatus) {
      await guest.update({
        status: newGuestStatus,
        peopleCount: Math.max(1, parseInt(peopleCount, 10) || 1),
      });
    }

    // ✅ Mark task success (agent did work)
    // (You can store agentId / note by adding columns if you want)
    await task.update({ status: "success" });

    // ✅ Charge human call fee NOW (per call)
    const payment = await chargeHumanCallFee({
      event,
      user,
      humanCallTaskId: task.id,
    });

    await task.update({ billingPaymentId: payment.id });

    // ✅ Cleanup future automations if confirmed/cancel (optional but recommended)
    if (newGuestStatus === "confirmed" || newGuestStatus === "cancel") {
      const futureWhere = {
        eventId: event.id,
        rsvpToken: guest.rsvpToken,
        status: "pending",
        scheduledAt: { [Op.gt]: new Date() },
      };

      await Promise.all([
        SMSAutomation.destroy({ where: futureWhere }),
        WhatsAppAutomation.destroy({ where: futureWhere }),
        AICallAutomation.destroy({ where: futureWhere }),
      ]);
    }

    return res.status(200).json({
      message: "Call result saved",
      guest: {
        id: guest.id,
        status: guest.status,
        peopleCount: guest.peopleCount,
      },
      paymentId: payment.id,
    });
  } catch (e) {
    console.error("submitHumanCallResult:", e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
};
