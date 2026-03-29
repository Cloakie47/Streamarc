// scripts/check-withdraw.mjs
import { readFileSync } from "fs";
const src = readFileSync(
  "./node_modules/@circle-fin/x402-batching/dist/client/index.js",
  "utf8",
);
const i = src.indexOf('name: "withdraw"');
console.log(src.substring(i, i + 300));
