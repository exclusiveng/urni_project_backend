import cron from "node-cron";
import https from "https";

const RENDER_URL = "https://urni-project-backend-44bx.onrender.com/";

export const startKeepAliveJob = () => {
    // Schedule task to run every 10 minutes
    cron.schedule("*/10 * * * *", () => {
        console.log(`[KeepAlive] Pinging ${RENDER_URL} to prevent sleep...`);

        https.get(RENDER_URL, (res) => {
            console.log(`[KeepAlive] Ping status: ${res.statusCode}`);
        }).on("error", (err) => {
            console.error(`[KeepAlive] Ping failed: ${err.message}`);
        });
    });

    console.log("[KeepAlive] Job scheduled: Runs every 10 minutes.");
};
