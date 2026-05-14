const fs = require("fs");

console.log("Starting script...");

const output = {
  generatedAt: new Date().toISOString(),
  deals: [
    {
      asin: "TEST123",
      title: "Pipeline Test Product",
      price: 49.99,
      category: "woodworking"
    }
  ]
};

// SAFE: ensure directory exists (no race condition possible)
try {
  fs.mkdirSync("data");
} catch (e) {
  if (e.code !== "EEXIST") throw e;
}

fs.writeFileSync(
  "data/deals.json",
  JSON.stringify(output, null, 2)
);

console.log("Wrote deals.json successfully");
