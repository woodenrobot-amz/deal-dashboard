const fs = require("fs");

const STATUS_FILE = "data/keepa-status.json";

function writeKeepaStatus(data, source) {
  if (!data || typeof data.tokensLeft !== "number") return false;

  const status = {
    capturedAt: new Date().toISOString(),
    source: String(source || "keepa"),
    tokensLeft: data.tokensLeft,
    refillRate: typeof data.refillRate === "number" ? data.refillRate : 0,
    refillIn: typeof data.refillIn === "number" ? data.refillIn : 0,
    tokensConsumed: typeof data.tokensConsumed === "number" ? data.tokensConsumed : 0,
    tokenFlowReduction: typeof data.tokenFlowReduction === "number" ? data.tokenFlowReduction : 0
  };

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
  return true;
}

module.exports = { STATUS_FILE, writeKeepaStatus };
