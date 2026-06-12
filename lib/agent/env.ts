// Side-effect module: load .env.local (then .env) into process.env.
// Import this FIRST in any standalone Node script/worker so env is populated
// before other modules evaluate. ESM evaluates imports in source order, so a
// leading `import "../lib/agent/env.ts"` runs before later imports initialize.
//
// Next.js loads .env.local automatically; this is only for the Node-run agent
// scripts and worker, which Next does not bundle.

import dotenv from "dotenv"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

const root = process.cwd()
const envLocal = resolve(root, ".env.local")
if (existsSync(envLocal)) {
  dotenv.config({ path: envLocal })
}
// Fill any gaps from .env without overriding .env.local.
dotenv.config()
