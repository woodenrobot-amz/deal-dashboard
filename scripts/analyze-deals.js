const fs = require("fs");

const data = JSON.parse(fs.readFileSync("data/deals.json", "utf8"));
const deals = data.deals || [];

function countBy(keyFn) {
  const map = new Map();

  for (const deal of deals) {
    const key = keyFn(deal);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }

  return [...map.entries()]
    .sort((a, b) => b[1] - a[1]);
}

console.log(`Generated: ${data.generatedAt}`);
console.log(`Deals: ${deals.length}`);

console.log("\nTop Brands:");
for (const [brand, count] of countBy(d => d.brand).slice(0, 25)) {
  console.log(`${count.toString().padStart(4)}  ${brand}`);
}

console.log("\nTop Leaf Categories:");
for (const [cat, count] of countBy(d => {
  const tree = d.keepaCategoryTree || [];
  const leaf = tree[tree.length - 1];
  return leaf ? `${leaf.id} - ${leaf.name}` : "";
}).slice(0, 30)) {
  console.log(`${count.toString().padStart(4)}  ${cat}`);
}

console.log("\nTop All Categories:");
const allCategoryCounts = new Map();

for (const deal of deals) {
  for (const cat of deal.keepaCategoryTree || []) {
    const key = `${cat.id} - ${cat.name}`;
    allCategoryCounts.set(key, (allCategoryCounts.get(key) || 0) + 1);
  }
}

for (const [cat, count] of [...allCategoryCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
  console.log(`${count.toString().padStart(4)}  ${cat}`);
}

console.log("\nBrand x Leaf Category:");
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
  console.log(`${count.toString().padStart(4)}  ${combo}`);
}