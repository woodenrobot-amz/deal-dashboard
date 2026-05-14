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

// write file directly (Node will NOT create missing folders automatically)
fs.mkdirSync("data", { recursive: true }); // safe + idempotent ALWAYS

fs.writeFileSync(
  "data/deals.json",
  JSON.stringify(output, null, 2)
);

console.log("Wrote deals.json successfully");
