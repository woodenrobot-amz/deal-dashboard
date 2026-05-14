console.log("Starting script...");

const fs = require("fs");
const path = require("path");

console.log("data exists:", fs.existsSync("data"));

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

// Ensure data directory exists (safe for multiple runs)
if (fs.existsSync("data")) {
  fs.rmSync("data", { recursive: true, force: true });
}
fs.mkdirSync("data", { recursive: true });

fs.writeFileSync(
  "data/deals.json",
  JSON.stringify(output, null, 2)
);

console.log("Wrote deals.json successfully");
