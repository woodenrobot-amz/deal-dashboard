const fs = require("fs");

const KEEPA_API_KEY = process.env.KEEPA_API_KEY;
const STREAM_NAME = process.argv[2];

const ENRICH_LIMITS = {
  woodworking: 100,
  deals_for_dudes: 100
};

const TOKEN_FLOOR = 75;
const MAX_DEAL_AGE_HOURS = 48;

if (!KEEPA_API_KEY) throw new Error("Missing KEEPA_API_KEY");
if (!STREAM_NAME) throw new Error("Missing stream argument");

if (!ENRICH_LIMITS[STREAM_NAME]) {
  throw new Error(`Unknown enrichment stream: ${STREAM_NAME}`);
}

function readJson(path, fallback) {
  try {
    if (!fs.existsSync(path)) return fallback;
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(path, data) {
  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

function readIgnoredAsins() {
  const parsed = readJson("data/ignored-asins.json", { ignoredAsins: [] });
  return new Set(parsed.ignoredAsins || []);
}

function buildProductUrl(asins) {
  return (
    `https://api.keepa.com/product?key=${KEEPA_API_KEY}` +
    `&domain=1` +
    `&asin=${asins.join(",")}` +
    `&stats=90` +
    `&rating=1` +
    `&history=1`
  );
}

function cleanTitle(value) {
  return String(value || "").replace(/^"+|"+$/g, "").replace(/""/g, '"').trim();
}

function priceFrom(values = []) {
  const val = values.find(v => typeof v === "number" && v > 0);
  return val ? val / 100 : null;
}

function getCurrentPrice(p) {
  const c = p.stats?.current || [];
  return priceFrom([c[10], c[1], c[2], c[0]]);
}

function getAvg90(p) {
  const a = p.stats?.avg90 || [];
  return priceFrom([a[10], a[1], a[2], a[0]]);
}

function getRating(p) {
  if (typeof p.rating === "number" && p.rating > 0) return p.rating / 10;
  const r = p.stats?.current?.[16];
  return typeof r === "number" && r > 0 ? r / 10 : null;
}

function getReviewCount(p) {
  if (typeof p.reviewCount === "number" && p.reviewCount >= 0) return p.reviewCount;
  const r = p.stats?.current?.[17];
  return typeof r === "number" && r >= 0 ? r : null;
}

function getSalesRank(p) {
  const r = p.stats?.current?.[3];
  return typeof r === "number" && r > 0 ? r : null;
}

function getImage(p) {
  if (p.imagesCSV) {
    return `https://images-na.ssl-images-amazon.com/images/I/${p.imagesCSV.split(",")[0]}`;
  }

  if (Array.isArray(p.images) && p.images.length) {
    const first = p.images[0];
    if (first.l) return `https://images-na.ssl-images-amazon.com/images/I/${first.l}`;
    if (first.m) return `https://images-na.ssl-images-amazon.com/images/I/${first.m}`;
  }

  return "";
}

function scoreDeal(d) {
  let score = 0;

  if (d.rating) score += d.rating * 5;

  if (d.price && d.avg90 && d.avg90 > d.price) {
    score += ((d.avg90 - d.price) / d.avg90) * 100 * 1.5;
  }

  if (d.rank && d.rank <= 5000) score += 30;
  if (d.reviewCount >= 500) score += 5;
  if (d.reviewCount >= 1000) score += 5;

  if (d.category === "deals_for_dudes") {
    if (d.price >= 20 && d.price <= 150) score += 5;
    if (d.reviewCount >= 2000) score += 5;
  }

  return Math.floor(score);
}

function normalizeProduct(p, streamName) {
  const asin = p.asin || "";
  const rank = getSalesRank(p);

  const deal = {
    asin,
    title: cleanTitle(p.title),
    category: streamName,
    price: getCurrentPrice(p),
    avg90: getAvg90(p),
    rating: getRating(p),
    reviewCount: getReviewCount(p),
    rank,
    img: getImage(p),
    url: asin ? `https://www.amazon.com/dp/${asin}` : "",
    keepa: asin ? `https://keepa.com/#!product/1-${asin}` : "",
    isLowAll: false,
    drop1Day: 0,
    isHot: rank !== null && rank <= 5000,
    isNameBrand: false,
    updatedAt: new Date().toISOString()
  };

  deal.dealScore = scoreDeal(deal);
  return deal;
}

function dedupeDeals(deals) {
  const map = new Map();

  for (const deal of deals) {
    if (!deal.asin) continue;

    const existing = map.get(deal.asin);

    if (!existing) {
      map.set(deal.asin, deal);
      continue;
    }

    const categories = new Set(
      String(existing.category || "")
        .split(",")
        .concat(String(deal.category || "").split(","))
        .map(x => x.trim())
        .filter(Boolean)
    );

    map.set(deal.asin, {
      ...existing,
      ...deal,
      category: [...categories].join(","),
      dealScore: Math.max(existing.dealScore || 0, deal.dealScore || 0)
    });
  }

  return [...map.values()].sort((a, b) => (b.dealScore || 0) - (a.dealScore || 0));
}

function removeExpiredDeals(deals) {
  const cutoff = Date.now() - MAX_DEAL_AGE_HOURS * 60 * 60 * 1000;

  return deals.filter(deal => {
    if (!deal.updatedAt) return false;
    return new Date(deal.updatedAt).getTime() > cutoff;
  });
}

async function fetchProducts(asins) {
  if (!asins.length) return { products: [], tokensLeft: null };

  console.log(`Enriching ${asins.length} ${STREAM_NAME} ASINs...`);

  const res = await fetch(buildProductUrl(asins));
  const data = await res.json();

  if (data.error) throw new Error(JSON.stringify(data.error));

  console.log(`Tokens consumed: ${data.tokensConsumed}, tokens left: ${data.tokensLeft}`);

  return {
    products: data.products || [],
    tokensLeft: data.tokensLeft
  };
}

async function run() {
  const ignoredAsins = readIgnoredAsins();
  const discovery = readJson("data/discovered-asins.json", { asins: [] });
  const existingDealsFile = readJson("data/deals.json", { deals: [] });

  const discovered = discovery.asins || [];

  const candidates = discovered
    .filter(item => (item.streams || []).includes(STREAM_NAME))
    .filter(item => !ignoredAsins.has(item.asin))
    .filter(item => !item.enrichedAt)
    .slice(0, ENRICH_LIMITS[STREAM_NAME]);

  console.log(`Stream: ${STREAM_NAME}`);
  console.log(`Discovery pool: ${discovered.length} total ASINs`);
  console.log(`Ignored ASINs: ${ignoredAsins.size}`);
  console.log(`Candidates selected: ${candidates.length}`);

  if (!candidates.length) {
    console.log(`No ${STREAM_NAME} ASINs waiting for enrichment.`);
    return;
  }

  const asins = candidates.map(item => item.asin);

  const { products, tokensLeft } = await fetchProducts(asins);

  if (tokensLeft !== null && tokensLeft < TOKEN_FLOOR) {
    console.log(`Warning: token floor crossed. Tokens left: ${tokensLeft}`);
  }

  const newDeals = products
    .map(p => normalizeProduct(p, STREAM_NAME))
    .filter(d => d.asin && d.title && d.price)
    .filter(d => !ignoredAsins.has(d.asin));

  const mergedDeals = removeExpiredDeals(
    dedupeDeals([...(existingDealsFile.deals || []), ...newDeals])
  ).filter(deal => !ignoredAsins.has(deal.asin));

  const now = new Date().toISOString();
  const enrichedSet = new Set(asins);

  const updatedDiscovery = discovered.map(item => {
    if (!enrichedSet.has(item.asin)) return item;

    return {
      ...item,
      enrichedAt: now,
      lastEnrichedStream: STREAM_NAME
    };
  });

  writeJson("data/deals.json", {
    generatedAt: now,
    source: "keepa-enrichment",
    lastEnrichmentStream: STREAM_NAME,
    dealCount: mergedDeals.length,
    deals: mergedDeals
  });

  writeJson("data/discovered-asins.json", {
    generatedAt: now,
    totalDiscovered: updatedDiscovery.length,
    asins: updatedDiscovery
  });

  console.log(`New valid ${STREAM_NAME} deals: ${newDeals.length}`);
  console.log(`Total active enriched deals: ${mergedDeals.length}`);
  console.log(`Marked ${enrichedSet.size} ASINs as enriched.`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
