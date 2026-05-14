const fs = require("fs");

// For now we simulate data so the pipeline works first
// We will plug Keepa in AFTER this runs successfully

const fakeDeals = [
  {
    asin: "TEST123",
    title: "Test Product",
    price: 49.99,
    avg90: 79.99,
    category: "woodworking",
    dealScore: 85
  }
];

const output = {
  generatedAt: new Date().toISOString(),
  source: "keepa-stage1-test",
  deals: fakeDeals
};

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/deals.json", JSON.stringify(output, null, 2));

console.log("Wrote deals.json");
