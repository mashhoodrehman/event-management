// services/reminderAutomation.service.js
const { reminderQueue } = require("../queues/reminderQueue");

/**
 * Create a delayed BullMQ job that will fire at schedule.sendDateTime
 */
async function scheduleReminderJob(reminderSchedule) {
  try {
    if (!reminderSchedule || !reminderSchedule.id) return;

    const sendAt = new Date(reminderSchedule.sendDateTime);
    if (isNaN(sendAt.getTime())) {
      console.warn(
        "Invalid sendDateTime for reminder schedule:",
        reminderSchedule.id
      );
      return;
    }

    const delay = Math.max(0, sendAt.getTime() - Date.now());

    await reminderQueue.add(
      "send-reminder", // job name
      {
        scheduleId: reminderSchedule.id,
        eventId: reminderSchedule.eventId,
      },
      {
        delay,
        attempts: 3,
        backoff: {
          type: "fixed",
          delay: 30_000, // 30 sec
        },
        removeOnComplete: 50,
        removeOnFail: false,
      }
    );

    console.log(
      `📨 [BullMQ] Reminder job scheduled: scheduleId=${reminderSchedule.id}, delay=${delay}ms`
    );
  } catch (err) {
    console.error("scheduleReminderJob error:", err);
  }
}

module.exports = { scheduleReminderJob };
