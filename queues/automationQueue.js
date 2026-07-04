// queues/automationQueue.js
const { Queue } = require("bullmq");

const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT || 6379),
};

const automationQueue = new Queue("automationQueue", { connection });

/**
 * Enqueue a single automation task to run at its scheduledAt time.
 * type: 'SMS' | 'WhatsApp' | 'AI_CALL' | 'HUMAN_CALL'
 * modelName: 'sms' | 'whatsapp' | 'ai' | 'human' (we’ll map this in worker)
 */
async function enqueueAutomationJob({ type, modelName, taskId, scheduledAt }) {
  const delayMs = Math.max(0, new Date(scheduledAt).getTime() - Date.now());

  await automationQueue.add(
    "send-automation",
    {
      type,
      modelName,
      taskId,
    },
    {
      delay: delayMs,
      attempts: 3,         // retry up to 3 times
      backoff: {
        type: "exponential",
        delay: 30000,       // 30s → 60s → 120s between retries
      },
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
}

module.exports = { automationQueue, enqueueAutomationJob };
