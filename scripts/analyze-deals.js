const fs = require("fs");

const data = JSON.parse(fs.readFileSync("data/deals.json", "utf8"));
const deals = data.deals || [];

const report = [];

function line(text = "") {
  report.push(text);
  console.log(text);
}

function getDealScore(deal) {
  const value =
    deal.calculated_deal_score ??
    deal.calculatedDealScore ??
    deal.dealScore ??
    deal.score ??
    deal.scoring?.total ??
    deal.scoring_components?.total ??
    0;

  const score = Number(value);
  return Number.isFinite(score) ? score : 0;
}

function summarizeScores(bucketDeals) {
  const scores = bucketDeals.map(getDealScore).filter(Number.isFinite);

  if (!scores.length) {
    return {
      avg: 0,
      max: 0,
      min: 0,
      over70: 0,
      over80: 0,
      over90: 0,
    };
  }

  return {
    avg: scores.reduce((a, b) => a + b, 0) / scores.length,
    max: Math.max(...scores),
    min: Math.min(...scores),
    over70: scores.filter(s => s >= 70).length,
    over80: scores.filter(s => s >= 80).length,
    over90: scores.filter(s => s >= 90).length,
  };
}

function bucketBy(keyFn) {
  const map = new Map();

  for (const deal of deals) {
    const key = keyFn(deal);
    if (!key) continue;

    if (!map.has(key)) map.set(key, []);
    map.get(key).push(deal);
  }

  return map;
}

function formatBucketSummary(title, buckets, limit = 50) {
  line(`\n${title}:`);
  line(
    `Count  AvgScore  MaxScore  70+  80+  90+  Name`
  );

  const sorted = [...buckets.entries()]
    .sort((a, b) => {
      const aSummary = summarizeScores(a[1]);
      const bSummary = summarizeScores(b[1]);

      // Primary sort: highest average score
      if (bSummary.avg !== aSummary.avg) {
        return bSummary.avg - aSummary.avg;
      }

      // Secondary sort: more 80+ deals
      if (bSummary.over80 !== aSummary.over80) {
        return bSummary.over80 - aSummary.over80;
      }

      // Third sort: higher count
      return b[1].length - a[1].length;
    })
    .slice(0, limit);

  for (const [label, bucketDeals] of sorted) {
    const s = summarizeScores(bucketDeals);

    line(
      `${String(bucketDeals.length).padStart(5)}  ` +
      `${s.avg.toFixed(1).padStart(8)}  ` +
      `${s.max.toFixed(1).padStart(8)}  ` +
      `${String(s.over70).padStart(3)}  ` +
      `${String(s.over80).padStart(3)}  ` +
      `${String(s.over90).padStart(3)}  ` +
      `${label}`
    );
  }
}

function getLeafCategory(deal) {
  const tree = deal.keepaCategoryTree || [];
  const leaf = tree[tree.length - 1];

  if (!leaf) return "";

  return `${leaf.id} - ${leaf.name}`;
}

function getAllCategoriesBucket() {
  const map = new Map();

  for (const deal of deals) {
    for (const cat of deal.keepaCategoryTree || []) {
      const key = `${cat.id} - ${cat.name}`;

      if (!map.has(key)) map.set(key, []);
      map.get(key).push(deal);
    }
  }

  return map;
}

line(`Generated: ${data.generatedAt || "Unknown"}`);
line(`Deals: ${deals.length}`);

const overall = summarizeScores(deals);
line(
  `Overall Score: avg ${overall.avg.toFixed(1)}, ` +
  `max ${overall.max.toFixed(1)}, ` +
  `70+ ${overall.over70}, ` +
  `80+ ${overall.over80}, ` +
  `90+ ${overall.over90}`
);

formatBucketSummary(
  "Top Brands by Deal Score",
  bucketBy(d => d.brand || "Unknown"),
  40
);

formatBucketSummary(
  "Top Leaf Categories by Deal Score",
  bucketBy(getLeafCategory),
  50
);

formatBucketSummary(
  "Top All Categories by Deal Score",
  getAllCategoriesBucket(),
  60
);

formatBucketSummary(
  "Brand x Leaf Category by Deal Score",
  bucketBy(d => {
    const brand = d.brand || "Unknown";
    const leaf = getLeafCategory(d);
    if (!leaf) return "";
    return `${brand} | ${leaf}`;
  }),
  75
);

fs.writeFileSync("analysis-report.txt", report.join("\n"));

console.log("\nReport written to analysis-report.txt");
