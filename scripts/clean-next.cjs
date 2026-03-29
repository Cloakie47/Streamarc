/**
 * Remove .next with retries (helps when OneDrive/antivirus locks files on Windows).
 */
const fs = require("fs");
const path = require("path");
const { setTimeout: delay } = require("timers/promises");

const nextDir = path.join(__dirname, "..", ".next");

(async () => {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      if (fs.existsSync(nextDir)) {
        fs.rmSync(nextDir, { recursive: true, force: true });
      }
      console.log("[clean-next] Removed .next");
      process.exit(0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[clean-next] attempt ${attempt}/5: ${msg}`);
      if (attempt === 5) {
        console.error("[clean-next] Could not delete .next — stop `npm run dev`, then run `npm run dev:clean` again.");
        process.exit(1);
      }
      await delay(300 * attempt);
    }
  }
})();
