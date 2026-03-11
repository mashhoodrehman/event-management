const { Queue } = require("bullmq");

const connection = {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT || 6379),
};

const emailQueue = new Queue("emailQueue", { connection });

/**
 * Enqueue an email to be sent.
 * @param {Object} emailOptions - nodemailer sendMail options (to, subject, html, etc.)
 */
async function enqueueEmailJob(emailOptions) {
    await emailQueue.add("send-email", emailOptions, {
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 30000, // 30s initial delay
        },
        removeOnComplete: true,
        removeOnFail: false,
    });
}

module.exports = { emailQueue, enqueueEmailJob };
