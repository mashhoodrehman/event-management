// queues/reminderQueue.js
const { Queue } = require("bullmq");

const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
  // password: process.env.REDIS_PASSWORD, // if you use auth
};

const REMINDER_QUEUE_NAME = "reminders";

// Main queue
const reminderQueue = new Queue(REMINDER_QUEUE_NAME, { connection });

module.exports = {
  reminderQueue,
  connection,
  REMINDER_QUEUE_NAME,
};
