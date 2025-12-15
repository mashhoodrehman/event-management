const { Op } = require("sequelize");
const HumanCallAutomation = require("../models/humanCallAutomation.model");
const Guest = require("../models/guest.model");
const Event = require("../models/event.model");

/**
 * GET /api/agent/human-calls?tab=pending|completed
 */
const listHumanCallsForAgent = async (req, res) => {
  try {
    const agentId = req.agent.id;
    const tab = String(req.query.tab || "pending");

    const baseWhere = { billingPaymentId: { [Op.not]: null } };

    let where = { ...baseWhere };

    if (tab === "pending") {
      where = {
        ...baseWhere,
        [Op.or]: [
          { status: "queued_for_agent" },
          { status: "assigned", assignedAgentId: agentId },
        ],
      };
    } else if (tab === "completed") {
      where = {
        ...baseWhere,
        status: { [Op.in]: ["success", "failed"] },
        assignedAgentId: agentId,
      };
    } else {
      return res
        .status(400)
        .json({ error: "tab must be pending or completed" });
    }

    const tasks = await HumanCallAutomation.findAll({
      where,
      order: [["scheduledAt", "ASC"]],
      limit: 200,
    });

    const tokens = tasks.map((t) => t.rsvpToken);
    const eventIds = [...new Set(tasks.map((t) => t.eventId))];

    const guests = await Guest.findAll({
      where: { rsvpToken: { [Op.in]: tokens } },
    });
    const guestByToken = new Map(guests.map((g) => [g.rsvpToken, g]));

    const events = await Event.findAll({
      where: { id: { [Op.in]: eventIds } },
    });
    const eventById = new Map(events.map((e) => [e.id, e]));

    const items = tasks.map((t) => {
      const guest = guestByToken.get(t.rsvpToken);
      const event = eventById.get(t.eventId);

      return {
        id: t.id,
        status: t.status,
        scheduledAt: t.scheduledAt,
        round: t.round,

        billingPaymentId: t.billingPaymentId,

        assignedAgentId: t.assignedAgentId,
        assignedAt: t.assignedAt,

        callResult: t.callResult,
        agentNotes: t.agentNotes,

        guest: {
          name: guest?.name || null,
          phone: guest?.phone || t.guestNumber,
          rsvpToken: t.rsvpToken,
          currentStatus: guest?.status || null,
          peopleCount: guest?.peopleCount ?? 1, // ✅ NEW
        },

        event: {
          id: event?.id || t.eventId,
          name: event?.name || null,
          eventDate: event?.eventDate || null,
          time: event?.time || null,
          location: event?.location || null,
        },
      };
    });

    return res.json({ tab, count: items.length, items });
  } catch (err) {
    console.error("listHumanCallsForAgent error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

/**
 * POST /api/agent/human-calls/:taskId/claim
 */
const claimHumanCall = async (req, res) => {
  try {
    const agentId = req.agent.id;
    const { taskId } = req.params;

    const task = await HumanCallAutomation.findByPk(taskId);
    if (!task) return res.status(404).json({ error: "Task not found" });

    if (!task.billingPaymentId) {
      return res.status(400).json({ error: "Task not billed yet" });
    }

    if (task.status !== "queued_for_agent") {
      return res
        .status(400)
        .json({ error: "Task already claimed or finished" });
    }

    await task.update({
      status: "assigned",
      assignedAgentId: agentId,
      assignedAt: new Date(),
    });

    return res.json({ message: "Claimed", taskId: task.id });
  } catch (err) {
    console.error("claimHumanCall error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

/**
 * POST /api/agent/human-calls/:taskId/complete
 * Body: { result, notes?, peopleCount? }
 */
const completeHumanCall = async (req, res) => {
  try {
    const agentId = req.agent.id;
    const { taskId } = req.params;
    const { result, notes, peopleCount } = req.body;

    const allowed = ["confirmed", "hesitate", "cancel", "no_answer"];
    if (!allowed.includes(result)) {
      return res.status(400).json({
        error: "result must be confirmed|hesitate|cancel|no_answer",
      });
    }

    if (peopleCount != null) {
      const n = Number(peopleCount);
      if (!Number.isInteger(n) || n < 1 || n > 50) {
        return res
          .status(400)
          .json({ error: "peopleCount must be integer 1..50" });
      }
    }

    const task = await HumanCallAutomation.findByPk(taskId);
    if (!task) return res.status(404).json({ error: "Task not found" });

    if (!task.billingPaymentId) {
      return res.status(400).json({ error: "Task not billed yet" });
    }

    if (task.assignedAgentId !== agentId) {
      return res.status(403).json({ error: "Not your task" });
    }

    if (task.status !== "assigned") {
      return res.status(400).json({ error: "Task is not in assigned state" });
    }

    const taskStatus = result === "no_answer" ? "failed" : "success";

    await task.update({
      status: taskStatus,
      callResult: result,
      agentNotes: notes || null,
    });

    // ✅ Update guest status + peopleCount (only on confirmed)
    if (
      result === "confirmed" ||
      result === "hesitate" ||
      result === "cancel"
    ) {
      const update = { status: result };

      if (result === "confirmed" && peopleCount != null) {
        update.peopleCount = Number(peopleCount);
      }

      await Guest.update(update, { where: { rsvpToken: task.rsvpToken } });
    }

    return res.json({
      message: "Completed",
      taskId: task.id,
      status: taskStatus,
    });
  } catch (err) {
    console.error("completeHumanCall error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

module.exports = {
  listHumanCallsForAgent,
  claimHumanCall,
  completeHumanCall,
};
