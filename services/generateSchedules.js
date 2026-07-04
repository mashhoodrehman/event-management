// services/generateSchedules.js

/**
 * We now generate schedules based on:
 * - EventSetting rows (steps)
 * - guests
 * - fixed 4-second delay between every task
 *
 * Input:
 *  guests: [ { phone, rsvpToken }, ... ]
 *  steps:  [ { id, baseType, executionDate, stepOrder, rounds }, ... ]
 *  templates: { smsTemplateId, whatsappTemplateId, aiCallTemplateId, humanCallTemplateId }
 *  eventId: number
 *
 * Special rule:
 *  - If executionDate === today, start from "now" (current time) and go forward.
 */

const PER_TASK_DELAY_MS = 4 * 1000; // 4 seconds
const FIRST_TASK_DELAY_TODAY_MS = 60 * 1000; // 1 minute delay for first task when date is today

function mapBaseTypeToKey(baseType) {
  switch (baseType) {
    case "sms":
      return "SMS";
    case "whatsapp":
      return "WhatsApp";
    case "ai_call":
      return "AI_CALL";
    case "human_call":
      return "HUMAN_CALL";
    default:
      return "SMS";
  }
}

function getTemplateIdForBaseType(baseType, templates = {}) {
  switch (baseType) {
    case "sms":
      return templates.smsTemplateId || null;
    case "whatsapp":
      return templates.whatsappTemplateId || null;
    case "ai_call":
      return templates.aiCallTemplateId || null;
    case "human_call":
      return templates.humanCallTemplateId || null;
    default:
      return null;
  }
}

function getDateKey(executionDate) {
  if (!executionDate) return null;
  if (typeof executionDate === "string") return executionDate; // 'YYYY-MM-DD'
  return executionDate.toISOString().slice(0, 10);
}

function generateSchedules({ guests, steps, templates, eventId }) {
  if (!Array.isArray(guests) || guests.length === 0) return [];
  if (!Array.isArray(steps) || steps.length === 0) return [];

  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10); // YYYY-MM-DD for "today"

  // 1) sort steps by date ASC, then stepOrder ASC, then id ASC
  const sortedSteps = [...steps].sort((a, b) => {
    const dateA = new Date(a.executionDate);
    const dateB = new Date(b.executionDate);

    if (dateA.getTime() !== dateB.getTime()) {
      return dateA - dateB;
    }

    if (a.stepOrder !== b.stepOrder) {
      return (a.stepOrder || 0) - (b.stepOrder || 0);
    }

    return (a.id || 0) - (b.id || 0);
  });

  // 2) keep a running offset (in tasks) per date
  //    so multiple steps on the same date chain after each other
  const offsetsByDate = new Map(); // dateKey -> number of tasks already scheduled for that date

  const tasks = [];
  const totalGuests = guests.length;

  for (const step of sortedSteps) {
    const dateKey = getDateKey(step.executionDate);
    if (!dateKey) continue;

    let dateStart;

    // 🔹 If the step date is today → start from "now" (current time)
    if (dateKey === todayKey) {
      dateStart = new Date(now);
      dateStart.setMilliseconds(0);
      dateStart = new Date(dateStart.getTime() + FIRST_TASK_DELAY_TODAY_MS);
      // (optional) remove ms jitter
      // dateStart.setMilliseconds(0);
    } else {
      // Other dates → midnight of that date
      dateStart = new Date(dateKey); // 00:00 of that day (local time for this server)
    }

    const baseType = step.baseType;
    const typeKey = mapBaseTypeToKey(baseType);
    const templateId = getTemplateIdForBaseType(baseType, templates);

    let offset = offsetsByDate.get(dateKey) || 0;

    const rounds = step.rounds && step.rounds > 0 ? Math.floor(step.rounds) : 1;

    // For each round, all guests, sequentially
    for (let round = 1; round <= rounds; round++) {
      for (let i = 0; i < totalGuests; i++) {
        const guest = guests[i];

        // 🚨 SKIP GUESTS WITHOUT PHONE NUMBERS
        if (!guest.phone) {
          console.log(`Skipping guest ${guest.name || guest.id} - No phone number`);
          continue;
        }

        // each task starts 4s after previous task for that date
        const scheduledAt = new Date(
          dateStart.getTime() + offset * PER_TASK_DELAY_MS
        );

        tasks.push({
          type: typeKey, // 'SMS' | 'WhatsApp' | 'AI_CALL' | 'HUMAN_CALL'
          guestNumber: guest.phone,
          rsvpToken: guest.rsvpToken,
          templateId,
          round,
          scheduledAt,
          eventId,
        });

        offset += 1; // next task is +4 seconds
      }
    }

    offsetsByDate.set(dateKey, offset);
  }

  // final safety sort (by scheduledAt)
  tasks.sort((a, b) => a.scheduledAt - b.scheduledAt);
  return tasks;
}

module.exports = { generateSchedules };

/////////////////////////////////////////////
// // services/generateSchedules.js
// const MS_PER_DAY = 24 * 60 * 60 * 1000;

// function addDaysKeepTime(date, days) {
//   // create new Date keeping hours/minutes/seconds
//   const d = new Date(date);
//   d.setDate(d.getDate() + days);
//   return d;
// }

// /**
//  * Generate scheduled tasks for all automations:
//  * automations: [
//  *   { key: 'SMS', executionDay: 1, rounds: 2, templateId, enabled: true },
//  *   { key: 'WhatsApp', executionDay: 4, rounds: 1, templateId, enabled: true },
//  *   ...
//  * ]
//  *
//  * guests: [{ phone: '+92123...' }, ...]
//  * automationStart: Date (start date/time)
//  * eventDate: Date (date/time of event)
//  *
//  * Returns: [{ type, guestNumber, templateId, round, scheduledAt (Date) }, ...]
//  */
// function generateSchedules({
//   guests,
//   automationStart,
//   eventDate,
//   automations,
// }) {
//   if (!Array.isArray(guests) || guests.length === 0) return [];

//   // 1. filter only enabled automations and sort by desired sequence:
//   const SEQ = ["SMS", "WhatsApp", "AI_CALL", "HUMAN_CALL"];
//   const active = automations
//     .filter((a) => a.enabled)
//     .sort((a, b) => SEQ.indexOf(a.key) - SEQ.indexOf(b.key));

//   // 2. compute start datetime for each automation (executionDay is 1-based)
//   const computed = active.map((a) => {
//     const start = addDaysKeepTime(automationStart, (a.executionDay || 1) - 1);
//     return { ...a, start };
//   });

//   // 3. compute end datetime for each automation: next start or eventDate
//   for (let i = 0; i < computed.length; i++) {
//     const cur = computed[i];
//     const next = computed[i + 1];
//     cur.end = next ? new Date(next.start) : new Date(eventDate);
//     // If end is before start, clamp end = start (will produce zero window)
//     if (cur.end < cur.start) cur.end = new Date(cur.start);
//   }

//   // 4. For each automation, split its window into `rounds` sequential segments,
//   //    then within each round evenly space sends for each guest.
//   const tasks = [];

//   const totalGuests = guests.length;

//   for (const auto of computed) {
//     const startMs = auto.start.getTime();
//     const endMs = auto.end.getTime();

//     // total window for this automation (ms)
//     const windowMs = Math.max(0, endMs - startMs);

//     // If rounds is 0 or not provided, treat as 1
//     const rounds = Math.max(1, Math.floor(auto.rounds) || 1);

//     // Divide window into `rounds` sequential round segments
//     const roundDurationMs = Math.floor(windowMs / rounds); // integer ms per round

//     for (let r = 0; r < rounds; r++) {
//       // round start and end
//       const roundStartMs = startMs + r * roundDurationMs;
//       // last round may include remainder to reach endMs
//       const roundEndMs =
//         r === rounds - 1 ? endMs : roundStartMs + roundDurationMs;

//       const roundWindowMs = Math.max(0, roundEndMs - roundStartMs);

//       // If only one guest or roundWindowMs==0, all guests get the same datetime (roundStart)
//       const perGuestIntervalMs =
//         totalGuests > 1 ? Math.floor(roundWindowMs / totalGuests) : 0;

//       for (let i = 0; i < totalGuests; i++) {
//         // guest scheduled time = roundStart + i * perGuestInterval
//         // add a tiny stagger (like +1 second) to avoid exact duplicates if perGuestIntervalMs === 0
//         const scheduledMs = roundStartMs + i * perGuestIntervalMs + 1000 * i;
//         const scheduledAt =
//           scheduledMs > roundEndMs
//             ? new Date(roundEndMs)
//             : new Date(scheduledMs);

//         tasks.push({
//           type: auto.key, // e.g. 'SMS', 'WhatsApp', 'AI_CALL', 'HUMAN_CALL'
//           guestNumber: guests[i].phone,
//           rsvpToken: guests[i].rsvpToken,
//           templateId: auto.templateId || null,
//           round: r + 1,
//           scheduledAt,
//           eventId: auto.eventId || null,
//         });
//       }
//     }
//   }

//   // Return tasks in chronological order (just in case)
//   tasks.sort((a, b) => a.scheduledAt - b.scheduledAt);
//   return tasks;
// }

// module.exports = { generateSchedules };
