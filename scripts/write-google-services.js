#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const outputPath = path.resolve(process.cwd(), "google-services.json");
const rawJson = process.env.GOOGLE_SERVICES_JSON;
const isProduction = process.env.EAS_BUILD_PROFILE === "production";

if (!rawJson || rawJson.trim().length === 0) {
  if (isProduction) {
    throw new Error(
      "GOOGLE_SERVICES_JSON is required for production Android builds.",
    );
  }
  console.log("GOOGLE_SERVICES_JSON is not set; skipping google-services.json generation.");
  process.exit(0);
}

let parsed;
try {
  parsed = JSON.parse(rawJson);
} catch (error) {
  throw new Error(
    `GOOGLE_SERVICES_JSON must be valid JSON: ${error instanceof Error ? error.message : String(error)}`,
  );
}

fs.writeFileSync(outputPath, `${JSON.stringify(parsed, null, 2)}\n`, {
  encoding: "utf8",
  mode: 0o600,
});
console.log(`Wrote ${path.relative(process.cwd(), outputPath)} from GOOGLE_SERVICES_JSON.`);
