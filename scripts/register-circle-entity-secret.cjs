/**
 * One-shot: register entity secret ciphertext with Circle (Developer Controlled Wallets).
 * Reads CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET from .env.local — do not commit secrets.
 */
const fs = require("fs");
const path = require("path");
const {
  registerEntitySecretCiphertext,
} = require("@circle-fin/developer-controlled-wallets");

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("Missing .env.local");
    process.exit(1);
  }
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnvLocal();

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;

if (!apiKey || !entitySecret) {
  console.error("Set CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET in .env.local");
  process.exit(1);
}

const recoveryDir = path.join(__dirname, "..", "circle-recovery");
if (!fs.existsSync(recoveryDir)) {
  fs.mkdirSync(recoveryDir, { recursive: true });
}

registerEntitySecretCiphertext({
  apiKey,
  entitySecret,
  recoveryFileDownloadPath: recoveryDir,
})
  .then((r) => {
    console.log("Recovery file:", JSON.stringify(r.data));
    console.log(`Also written under: ${path.resolve(recoveryDir)}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
