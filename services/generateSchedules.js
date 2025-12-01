// services/generateSchedules.js
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function addDaysKeepTime(date, days) {
  // create new Date keeping hours/minutes/seconds
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Generate scheduled tasks for all automations:
 * automations: [
 *   { key: 'SMS', executionDay: 1, rounds: 2, templateId, enabled: true },
 *   { key: 'WhatsApp', executionDay: 4, rounds: 1, templateId, enabled: true },
 *   ...
 * ]
 *
 * guests: [{ phone: '+92123...' }, ...]
 * automationStart: Date (start date/time)
 * eventDate: Date (date/time of event)
 *
 * Returns: [{ type, guestNumber, templateId, round, scheduledAt (Date) }, ...]
 */
function generateSchedules({
  guests,
  automationStart,
  eventDate,
  automations,
}) {
  if (!Array.isArray(guests) || guests.length === 0) return [];

  // 1. filter only enabled automations and sort by desired sequence:
  const SEQ = ["SMS", "WhatsApp", "AI_CALL", "HUMAN_CALL"];
  const active = automations
    .filter((a) => a.enabled)
    .sort((a, b) => SEQ.indexOf(a.key) - SEQ.indexOf(b.key));

  // 2. compute start datetime for each automation (executionDay is 1-based)
  const computed = active.map((a) => {
    const start = addDaysKeepTime(automationStart, (a.executionDay || 1) - 1);
    return { ...a, start };
  });

  // 3. compute end datetime for each automation: next start or eventDate
  for (let i = 0; i < computed.length; i++) {
    const cur = computed[i];
    const next = computed[i + 1];
    cur.end = next ? new Date(next.start) : new Date(eventDate);
    // If end is before start, clamp end = start (will produce zero window)
    if (cur.end < cur.start) cur.end = new Date(cur.start);
  }

  // 4. For each automation, split its window into `rounds` sequential segments,
  //    then within each round evenly space sends for each guest.
  const tasks = [];

  const totalGuests = guests.length;

  for (const auto of computed) {
    const startMs = auto.start.getTime();
    const endMs = auto.end.getTime();

    // total window for this automation (ms)
    const windowMs = Math.max(0, endMs - startMs);

    // If rounds is 0 or not provided, treat as 1
    const rounds = Math.max(1, Math.floor(auto.rounds) || 1);

    // Divide window into `rounds` sequential round segments
    const roundDurationMs = Math.floor(windowMs / rounds); // integer ms per round

    for (let r = 0; r < rounds; r++) {
      // round start and end
      const roundStartMs = startMs + r * roundDurationMs;
      // last round may include remainder to reach endMs
      const roundEndMs =
        r === rounds - 1 ? endMs : roundStartMs + roundDurationMs;

      const roundWindowMs = Math.max(0, roundEndMs - roundStartMs);

      // If only one guest or roundWindowMs==0, all guests get the same datetime (roundStart)
      const perGuestIntervalMs =
        totalGuests > 1 ? Math.floor(roundWindowMs / totalGuests) : 0;

      for (let i = 0; i < totalGuests; i++) {
        // guest scheduled time = roundStart + i * perGuestInterval
        // add a tiny stagger (like +1 second) to avoid exact duplicates if perGuestIntervalMs === 0
        const scheduledMs = roundStartMs + i * perGuestIntervalMs + 1000 * i;
        const scheduledAt =
          scheduledMs > roundEndMs
            ? new Date(roundEndMs)
            : new Date(scheduledMs);

        tasks.push({
          type: auto.key, // e.g. 'SMS', 'WhatsApp', 'AI_CALL', 'HUMAN_CALL'
          guestNumber: guests[i].phone,
          rsvpToken: guests[i].rsvpToken,
          templateId: auto.templateId || null,
          round: r + 1,
          scheduledAt,
          eventId: auto.eventId || null,
        });
      }
    }
  }

  // Return tasks in chronological order (just in case)
  tasks.sort((a, b) => a.scheduledAt - b.scheduledAt);
  return tasks;
}

module.exports = { generateSchedules };
