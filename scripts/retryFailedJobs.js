require("dotenv").config();
const { Queue } = require("bullmq");

const connection = {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT || 6379),
};

const automationQueue = new Queue("automationQueue", { connection });

async function retryAllFailed() {
    const failedJobs = await automationQueue.getFailed();

    if (failedJobs.length === 0) {
        console.log("✅ No failed jobs found.");
        process.exit(0);
    }

    console.log(`🔁 Found ${failedJobs.length} failed job(s). Retrying...`);

    for (const job of failedJobs) {
        try {
            await job.retry("failed");
            console.log(`  ✅ Retried job ${job.id} (type=${job.data.type}, taskId=${job.data.taskId})`);
        } catch (err) {
            console.error(`  ❌ Failed to retry job ${job.id}:`, err.message);
        }
    }

    console.log("Done.");
    process.exit(0);
}

retryAllFailed();
