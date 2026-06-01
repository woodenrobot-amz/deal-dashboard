const fs = require("fs");

const data = JSON.parse(fs.readFileSync("data/deals.json", "utf8"));
const deals = data.deals || [];

const report = [];

function line(text = "") {
  report.push(text);
  console.log(text);
}

function countBy(keyFn) {
  const map = new Map();

  for (const deal of deals) {
    const key = keyFn(deal);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }

  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

line(`Generated: ${data.generatedAt}`);
line(`Deals: ${deals.length}`);

line("\nTop Brands:");
for (const [brand, count] of countBy(d => d.brand).slice(0, 25)) {
  line(`${count.toString().padStart(4)}  ${brand}`);
}

line("\nTop Leaf Categories:");
for (const [cat, count] of countBy(d => {
  const tree = d.keepaCategoryTree || [];
  const leaf = tree[tree.length - 1];
  return leaf ? `${leaf.id} - ${leaf.name}` : "";
}).slice(0, 30)) {
  line(`${count.toString().padStart(4)}  ${cat}`);
}

line("\nTop All Categories:");
const allCategoryCounts = new Map();

for (const deal of deals) {
  for (const cat of deal.keepaCategoryTree || []) {
    const key = `${cat.id} - ${cat.name}`;
    allCategoryCounts.set(key, (allCategoryCounts.get(key) || 0) + 1);
  }
}

for (const [cat, count] of [...allCategoryCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
  line(`${count.toString().padStart(4)}  ${cat}`);
}

line("\nBrand x Leaf Category:");
const comboCounts = new Map();

for (const deal of deals) {
  const brand = deal.brand || "Unknown";
  const tree = deal.keepaCategoryTree || [];
  const leaf = tree[tree.length - 1];
  if (!leaf) continue;

  const key = `${brand} | ${leaf.id} - ${leaf.name}`;
  comboCounts.set(key, (comboCounts.get(key) || 0) + 1);
}

for (const [combo, count] of [...comboCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
  line(`${count.toString().padStart(4)}  ${combo}`);
}

fs.writeFileSync("analysis-report.txt", report.join("\n"));

console.log("\nReport written to analysis-report.txt");
