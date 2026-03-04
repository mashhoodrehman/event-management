const { Worker } = require("bullmq");
const transporter = require("../config/email");

const connection = {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT || 6379),
};

const emailWorker = new Worker(
    "emailQueue",
    async (job) => {
        const emailOptions = job.data;
        try {
            console.log(`Sending email to ${emailOptions.to}...`);
            await transporter.sendMail(emailOptions);
            console.log(`Email sent to ${emailOptions.to}`);
        } catch (error) {
            console.error(`Failed to send email to ${emailOptions.to}:`, error);
            throw error; // Let BullMQ handle retries
        }
    },
    { connection }
);

emailWorker.on("completed", (job) => {
    console.log(`Email job ${job.id} completed successfully`);
});

emailWorker.on("failed", (job, err) => {
    console.error(`Email job ${job.id} failed with error ${err.message}`);
});

module.exports = emailWorker;
