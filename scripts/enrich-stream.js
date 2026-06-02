const fs = require("fs");

const KEEPA_API_KEY = process.env.KEEPA_API_KEY;
const STREAM_NAME = process.argv[2];

const ENRICH_LIMITS = {
  woodworking_core: 100,
  woodworking: 100,
  dudes_power: 100,
  three_d_printing: 100,
deals_for_dudes: 100,
};

const TOKEN_FLOOR = 75;
const MAX_DEAL_AGE_HOURS = 48;
const MIN_KEEPA_HISTORY_DAYS = 90;

const KEEPA_EPOCH_MS = Date.UTC(2011, 0, 1);

const TOP_TIER_BRANDS = new Set([
  "dewalt",
  "milwaukee",
  "makita",
  "bosch",
  "festool",
  "sawstop",
  "woodpeckers",
  "starrett",
  "bessey",
  "kreg",
  "jessem",
  "incra",
  "freud",
  "diablo",
  "whiteside",
  "amana tool",
  "wera",
  "wiha",
  "knipex",
  "titebond",
  "rubio monocoat",
  "rockler",
  "woodriver",
  "veritas",
  "lee valley",
"anker",
      "jackery",
      "ecoflow",
      "bluetti",
"govee"
]);

const MID_TIER_BRANDS = new Set([
  "ridgid",
  "ryobi",
  "metabo hpt",
  "skil",
  "jet",
  "powermatic",
  "grizzly",
  "laguna",
  "3m",
  "mirka",
  "fastcap",
  "microjig",
  "milescraft",
  "toughbuilt",
  "packout",
  "tanos",
  "klingspor",
"fein",
"workpro",
"spetool",
"ugreen",
"baseus",
"belkin",
"kasa",
"tp-link",
"zendure",
"goal zero"
]);

const TOP_TIER_BRAND_BOOST = 20;
const MID_TIER_BRAND_BOOST = 8;

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

function normalizeAsin(value) {
  return String(value || "").trim().toUpperCase();
}

function readIgnoredAsins() {
  const parsed = readJson("data/ignored-asins.json", { ignoredAsins: [] });

  if (Array.isArray(parsed)) {
    return new Set(parsed.map(normalizeAsin).filter(Boolean));
  }

  return new Set((parsed.ignoredAsins || []).map(normalizeAsin).filter(Boolean));
}

function readIgnoredParentAsins() {
  const parsed = readJson("data/ignored-parent-asins.json", { ignoredParentAsins: [] });

  if (Array.isArray(parsed)) {
    return new Set(parsed.map(normalizeAsin).filter(Boolean));
  }

  return new Set((parsed.ignoredParentAsins || []).map(normalizeAsin).filter(Boolean));
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

function cleanText(value) {
  return String(value || "")
    .replace(/^"+|"+$/g, "")
    .replace(/""/g, '"')
    .trim()
    .toLowerCase();

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
  if (typeof p.reviewCount === "number" && p.reviewCount >= 0) {
    return p.reviewCount;
  }

  const r = p.stats?.current?.[17];
  return typeof r === "number" && r >= 0 ? r : null;
}

function getSalesRank(p) {
  const r = p.stats?.current?.[3];
  return typeof r === "number" && r > 0 ? r : null;
}

function getParentAsin(p) {
  return normalizeAsin(p.parentAsin || p.parentASIN || "");
}

function getKeepaCategoryIds(p) {
  return [
    ...(Array.isArray(p.categories) ? p.categories : []),
    p.categoryTree?.[0]?.catId,
    p.categoryTree?.[1]?.catId,
    p.categoryTree?.[2]?.catId,
    p.categoryTree?.[3]?.catId
  ]
    .map(value => String(value || "").trim())
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index);
}

function getKeepaCategoryTree(p) {
  if (!Array.isArray(p.categoryTree)) return [];

  return p.categoryTree.map(cat => ({
    id: String(cat.catId || "").trim(),
    name: String(cat.name || "").trim().toLowerCase()
  })).filter(cat => cat.id || cat.name);
}

function getVariationCount(p) {
  if (Array.isArray(p.variationCSV)) return p.variationCSV.length;

  if (typeof p.variationCSV === "string" && p.variationCSV.trim()) {
    return p.variationCSV
      .split(",")
      .map(normalizeAsin)
      .filter(Boolean).length;
  }

  if (Array.isArray(p.variations)) return p.variations.length;

  return 0;
}

function keepaMinutesToDate(value) {
  if (typeof value !== "number" || value <= 0) return null;
  return new Date(KEEPA_EPOCH_MS + value * 60 * 1000);
}

function getProductAgeDays(p) {
  const trackedSince = keepaMinutesToDate(p.trackingSince);
  if (!trackedSince) return null;

  return Math.floor(
    (Date.now() - trackedSince.getTime()) / (24 * 60 * 60 * 1000)
  );
}

function hasEnoughKeepaHistory(p) {
  const ageDays = getProductAgeDays(p);
  return ageDays !== null && ageDays >= MIN_KEEPA_HISTORY_DAYS;
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

function normalizeBrand(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getBrandTier(brand) {
  const normalized = normalizeBrand(brand);

  if (TOP_TIER_BRANDS.has(normalized)) return "top";
  if (MID_TIER_BRANDS.has(normalized)) return "mid";

  return "off";
}

function getBrandBoost(brand) {
  const tier = getBrandTier(brand);

  if (tier === "top") return TOP_TIER_BRAND_BOOST;
  if (tier === "mid") return MID_TIER_BRAND_BOOST;

  return 0;
}

function scoreDeal(d) {
  const breakdown = {
    rating: 0,
    discount: 0,
    rank: 0,
    reviews: 0,
    variationFamily: 0,
    productAge: 0,
    streamFit: 0,
    brand: 0
  };

  if (d.rating) breakdown.rating += d.rating * 5;

  if (d.price && d.avg90 && d.avg90 > d.price) {
    breakdown.discount += ((d.avg90 - d.price) / d.avg90) * 100 * 1.5;
  }

  if (d.rank && d.rank <= 5000) breakdown.rank += 30;

  if (d.reviewCount >= 500) breakdown.reviews += 5;
  if (d.reviewCount >= 1000) breakdown.reviews += 5;

  if (d.variationCount >= 8) breakdown.variationFamily += 3;
  if (d.variationCount >= 20) breakdown.variationFamily += 5;

  if (d.productAgeDays >= 365) breakdown.productAge += 3;
  if (d.productAgeDays >= 730) breakdown.productAge += 5;

  if (d.category === "deals_for_dudes") {
    if (d.price >= 20 && d.price <= 150) breakdown.streamFit += 5;
    if (d.reviewCount >= 2000) breakdown.streamFit += 5;
  }

  breakdown.brand += getBrandBoost(d.brand);

  const roundedBreakdown = Object.fromEntries(
    Object.entries(breakdown).map(([key, value]) => [key, Math.floor(value)])
  );

  const total = Object.values(roundedBreakdown).reduce((sum, value) => sum + value, 0);

  return {
    total,
    breakdown: roundedBreakdown
  };
}

function getUiCategory(streamName) {
  return String(streamName || "").toLowerCase();
}

function normalizeProduct(p, streamName) {
  const asin = normalizeAsin(p.asin);
  const parentAsin = getParentAsin(p);
  const variationCount = getVariationCount(p);
  const rank = getSalesRank(p);
  const productAgeDays = getProductAgeDays(p);


  const deal = {
    asin,
    parentAsin: parentAsin || "",
    familyKey: parentAsin || asin,
    variationCount,
    productAgeDays,
    title: cleanText(p.title),
    brand: cleanText(p.brand),
    brandTier: getBrandTier(p.brand),
    category: getUiCategory(streamName),
keepaCategoryIds: getKeepaCategoryIds(p),
keepaCategoryTree: getKeepaCategoryTree(p),
    sourceStream: streamName,
    sources: ["keepa"],
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
    isNameBrand: getBrandTier(p.brand) !== "off",
    updatedAt: new Date().toISOString()
  };

  const score = scoreDeal(deal);

  deal.dealScore = score.total;
  deal.scoreBreakdown = score.breakdown;

  return deal;
}
function mergeCategories(a, b) {
  return [...new Set(
    String(a || "")
      .split(",")
      .concat(String(b || "").split(","))
      .map(x => x.trim())
      .filter(Boolean)
  )].join(",");
}

function mergeSources(a = [], b = []) {
  return [...new Set([...(a || []), ...(b || [])].filter(Boolean))];
}

function chooseBetterDeal(existing, incoming) {
  if ((incoming.dealScore || 0) > (existing.dealScore || 0)) return incoming;
  if ((incoming.dealScore || 0) < (existing.dealScore || 0)) return existing;

  if ((incoming.rank || Infinity) < (existing.rank || Infinity)) return incoming;
  if ((incoming.reviewCount || 0) > (existing.reviewCount || 0)) return incoming;
  if ((incoming.variationCount || 0) > (existing.variationCount || 0)) return incoming;

  return existing;
}

function dedupeDeals(deals) {
  const asinMap = new Map();

  for (const deal of deals) {
    if (!deal.asin) continue;

    const existing = asinMap.get(deal.asin);

    if (!existing) {
      asinMap.set(deal.asin, deal);
      continue;
    }

    const better = chooseBetterDeal(existing, deal);

    asinMap.set(deal.asin, {
      ...better,
      category: mergeCategories(existing.category, deal.category),
      sources: mergeSources(existing.sources, deal.sources),
      dealScore: Math.max(existing.dealScore || 0, deal.dealScore || 0)
    });
  }

  const familyMap = new Map();

  for (const deal of asinMap.values()) {
    const familyKey = deal.familyKey || deal.parentAsin || deal.asin;
    const existing = familyMap.get(familyKey);

    if (!existing) {
      familyMap.set(familyKey, deal);
      continue;
    }

    const better = chooseBetterDeal(existing, deal);

    familyMap.set(familyKey, {
      ...better,
      category: mergeCategories(existing.category, deal.category),
      sources: mergeSources(existing.sources, deal.sources),
      spcImported: Boolean(existing.spcImported || deal.spcImported),
      spcCapturedAt: existing.spcCapturedAt || deal.spcCapturedAt || "",
      siblingAsins: [
        ...new Set([
          ...(existing.siblingAsins || []),
          ...(deal.siblingAsins || []),
          existing.asin,
          deal.asin
        ].filter(Boolean))
      ],
      dealScore: Math.max(existing.dealScore || 0, deal.dealScore || 0)
    });
  }

  return [...familyMap.values()].sort(
    (a, b) => (b.dealScore || 0) - (a.dealScore || 0)
  );
}

function removeExpiredDeals(deals) {
  const cutoff = Date.now() - MAX_DEAL_AGE_HOURS * 60 * 60 * 1000;

  return deals.filter(deal => {
    if (!deal.updatedAt) return false;
    return new Date(deal.updatedAt).getTime() > cutoff;
  });
}

function isActiveDeal(deal) {
  if (!deal.updatedAt) return false;

  const cutoff = Date.now() - MAX_DEAL_AGE_HOURS * 60 * 60 * 1000;
  return new Date(deal.updatedAt).getTime() > cutoff;
}

async function fetchProducts(asins) {
  if (!asins.length) {
    return {
      products: [],
      tokensLeft: null
    };
  }

  console.log(`Enriching ${asins.length} ${STREAM_NAME} ASINs...`);

  const res = await fetch(buildProductUrl(asins));
  const data = await res.json();

  if (data.error) {
    throw new Error(JSON.stringify(data.error));
  }

  console.log(`Tokens consumed: ${data.tokensConsumed}, tokens left: ${data.tokensLeft}`);

  return {
    products: data.products || [],
    tokensLeft: data.tokensLeft
  };
}

async function run() {
  const ignoredAsins = readIgnoredAsins();
  const ignoredParentAsins = readIgnoredParentAsins();

  const discovery = readJson("data/discovered-asins.json", { asins: [] });
  const existingDealsFile = readJson("data/deals.json", { deals: [] });

  const discovered = discovery.asins || [];
  const existingDeals = existingDealsFile.deals || [];

  const candidates = discovered
    .filter(item => {
      const asin = normalizeAsin(item.asin);
      if (!asin) return false;
      if (ignoredAsins.has(asin)) return false;
      if (item.parentAsin && ignoredParentAsins.has(normalizeAsin(item.parentAsin))) return false;
      if (item.enrichedAt || item.lastEnrichedAt) return false;
      return (item.streams || []).includes(STREAM_NAME);
    })
    .slice(0, ENRICH_LIMITS[STREAM_NAME]);

  console.log(`Stream Execution: ${STREAM_NAME}`);
  console.log(`Discovery Pool Size: ${discovered.length}`);
  console.log(`Total Candidates Chosen for Run: ${candidates.length}`);

  if (!candidates.length) {
    console.log(`No ${STREAM_NAME} ASINs waiting for enrichment.`);
    return;
  }

  const asins = candidates
    .map(item => normalizeAsin(item.asin))
    .filter(Boolean);

  const { products, tokensLeft } = await fetchProducts(asins);

  if (tokensLeft !== null && tokensLeft < TOKEN_FLOOR) {
    console.log(`Warning: token floor crossed. Tokens left: ${tokensLeft}`);
  }

  const tooNewCount = products.filter(p => !hasEnoughKeepaHistory(p)).length;

  console.log(
    `Excluded for under ${MIN_KEEPA_HISTORY_DAYS} days Keepa history: ${tooNewCount}`
  );

  const newDeals = products
    .filter(hasEnoughKeepaHistory)
    .map(p => normalizeProduct(p, STREAM_NAME))
    .filter(d => d.asin && d.title && d.price)
    .filter(d => !ignoredAsins.has(d.asin))
    .filter(d => !d.parentAsin || !ignoredParentAsins.has(d.parentAsin));

  const mergedDeals = removeExpiredDeals(
    dedupeDeals([
      ...existingDeals,
      ...newDeals
    ])
  )
    .filter(deal => !ignoredAsins.has(normalizeAsin(deal.asin)))
    .filter(deal => !deal.parentAsin || !ignoredParentAsins.has(deal.parentAsin));

  const now = new Date().toISOString();

  const productByAsin = new Map(
    products.map(p => [normalizeAsin(p.asin), p])
  );

  const enrichedSet = new Set(asins);

  const updatedDiscovery = discovered.map(item => {
    const asin = normalizeAsin(item.asin);

    if (!enrichedSet.has(asin)) {
      return item;
    }

    const product = productByAsin.get(asin);

    const parentAsin = product
      ? getParentAsin(product)
      : normalizeAsin(item.parentAsin);

    const variationCount = product
      ? getVariationCount(product)
      : item.variationCount || 0;

    return {
      ...item,
      asin,
      parentAsin: parentAsin || item.parentAsin || "",
      familyKey: parentAsin || asin,
      variationCount,
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
  console.log(`Total active enriched deals after parent-family dedupe: ${mergedDeals.length}`);
  console.log(`Marked ${enrichedSet.size} ASINs as enriched.`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
