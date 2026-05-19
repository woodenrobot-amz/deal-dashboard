const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");
const MAX_AGE_HOURS = 48;

const now = Date.now();
const cutoff = now - MAX_AGE_HOURS * 60 * 60 * 1000;

const timestampFields = [
  "enrichedAt",
  "enriched_at",
  "lastEnrichedAt",
  "last_enriched_at",
  "updatedAt",
  "updated_at"
];

function getDealTimestamp(deal) {
  for (const field of timestampFields) {
    if (deal && deal[field]) {
      const parsed = Date.parse(deal[field]);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }

  return null;
}

function isBookmarkedOrPinned(deal) {
  return Boolean(
    deal.bookmarked ||
    deal.bookmark ||
    deal.pinned ||
    deal.manualKeep ||
    deal.keep
  );
}

function shouldKeepDeal(deal) {
  if (!deal || typeof deal !== "object") return false;

  // Never prune manually saved deals.
  if (isBookmarkedOrPinned(deal)) return true;

  const timestamp = getDealTimestamp(deal);

  // If we cannot prove it is stale, keep it.
  if (!timestamp) return true;

  return timestamp >= cutoff;
}

function pruneArray(deals) {
  const before = deals.length;
  const kept = deals.filter(shouldKeepDeal);
  const removed = before - kept.length;

  return { kept, before, removed };
}

function pruneFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const json = JSON.parse(raw);

  let result;

  if (Array.isArray(json)) {
    result = pruneArray(json);

    if (result.removed > 0) {
      fs.writeFileSync(
        filePath,
        JSON.stringify(result.kept, null, 2) + "\n"
      );
    }
  } else if (json && Array.isArray(json.deals)) {
    result = pruneArray(json.deals);

    if (result.removed > 0) {
      const nextJson = {
        ...json,
        generatedAt: new Date().toISOString(),
        prunedAt: new Date().toISOString(),
        deals: result.kept
      };

      fs.writeFileSync(
        filePath,
        JSON.stringify(nextJson, null, 2) + "\n"
      );
    }
  } else {
    console.log(`Skipped ${path.basename(filePath)} - no deal array found.`);
    return;
  }

  console.log(
    `${path.basename(filePath)}: ${result.before} before, ${result.kept.length} kept, ${result.removed} removed.`
  );
}

function main() {
  if (!fs.existsSync(DATA_DIR)) {
    console.log("No data directory found.");
    return;
  }

  const files = fs
    .readdirSync(DATA_DIR)
    .filter(file => file.endsWith(".json"))
    .map(file => path.join(DATA_DIR, file));

  if (files.length === 0) {
    console.log("No JSON files found in data directory.");
    return;
  }

  console.log(`Pruning deals older than ${MAX_AGE_HOURS} hours...`);

  for (const file of files) {
    try {
      pruneFile(file);
    } catch (err) {
      console.error(`Failed to prune ${path.basename(file)}:`, err.message);
      process.exitCode = 1;
    }
  }
}

main();
