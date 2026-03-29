import { readFileSync } from 'fs';
const src = readFileSync('./node_modules/@circle-fin/x402-batching/dist/client/index.js', 'utf8');
const i = src.indexOf('name: "deposit"');
console.log(src.substring(i, i + 400));
