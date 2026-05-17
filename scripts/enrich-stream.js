const fs = require("fs");

const KEEPA_API_KEY = process.env.KEEPA_API_KEY;
const STREAM_NAME = process.argv[2];

const ENRICH_LIMITS = {
  woodworking: 100,
  deals_for_dudes: 100,
  three_d_printing: 10
};

const SPC_DEFAULT_STREAM = "deals_for_dudes";
const TOKEN_FLOOR = 75;
const MAX_DEAL_AGE_HOURS = 48;
const MIN_KEEPA_HISTORY_DAYS = 90;

const KEEPA_EPOCH_MS = Date.UTC(2011, 0, 1);

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

function readSpcImports() {
  const parsed = readJson("data/spc-asins.json", []);

  const rawItems = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.asins)
      ? parsed.asins
      : [];

  return rawItems
    .map(item => {
      if (typeof item === "string") {
        return {
          asin: normalizeAsin(item),
          source: "sponsored_products_creators",
          streams: [SPC_DEFAULT_STREAM]
        };
      }

      const asin = normalizeAsin(item.asin);

      return {
        ...item,
        asin,
        source: item.source || "sponsored_products_creators",
        streams: Array.isArray(item.streams) && item.streams.length > 0
          ? item.streams
          : [SPC_DEFAULT_STREAM]
      };
    })
    .filter(item => item.asin);
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
  return String(value || "")
    .replace(/^"+|"+$/g, "")
    .replace(/""/g, '"')
    .trim();
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

function scoreDeal(d) {
  const breakdown = {
    rating: 0,
    discount: 0,
    rank: 0,
    reviews: 0,
    variationFamily: 0,
    productAge: 0,
    streamFit: 0,
    spc: 0
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

  if (d.spcImported) {
    breakdown.spc += 10;
  }

  const roundedBreakdown = Object.fromEntries(
    Object.entries(breakdown).map(([key, value]) => [key, Math.floor(value)])
  );

  const total = Object.values(roundedBreakdown).reduce((sum, value) => sum + value, 0);

  return {
    total,
    breakdown: roundedBreakdown
  };
}

function normalizeProduct(p, streamName, sourceMeta = {}) {
  const asin = normalizeAsin(p.asin);
  const parentAsin = getParentAsin(p);
  const variationCount = getVariationCount(p);
  const rank = getSalesRank(p);
  const productAgeDays = getProductAgeDays(p);
  const spcImported = Boolean(sourceMeta.spcImported);

  const deal = {
    asin,
    parentAsin: parentAsin || "",
    familyKey: parentAsin || asin,
    variationCount,
    productAgeDays,
    title: cleanTitle(p.title),
    category: streamName,
    sources: spcImported
      ? ["sponsored_products_creators", "keepa"]
      : ["keepa"],
    spcImported,
    spcCapturedAt: sourceMeta.spcCapturedAt || "",
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
      spcImported: Boolean(existing.spcImported || deal.spcImported),
      spcCapturedAt: existing.spcCapturedAt || deal.spcCapturedAt || "",
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
  const spcImports = readSpcImports();

  const discovered = discovery.asins || [];
  const existingDeals = existingDealsFile.deals || [];

  const activeDealAsins = new Set(
    existingDeals
      .filter(isActiveDeal)
      .map(deal => normalizeAsin(deal.asin))
      .filter(Boolean)
  );

  // --- GLOBAL CROSS-REFERENCE MAP PRODUCTION ---
  
  // 1. Map ALL discovered items globally (unfiltered by current stream)
  const globalDiscoveryMap = new Map();
  for (const item of discovered) {
    const asin = normalizeAsin(item.asin);
    if (!asin) continue;
    
    // Pass baseline global exclusions
    if (ignoredAsins.has(asin)) continue;
    if (item.parentAsin && ignoredParentAsins.has(normalizeAsin(item.parentAsin))) continue;
    if (item.enrichedAt) continue;

    globalDiscoveryMap.set(asin, {
      ...item,
      sourceType: "discovery",
      spcImported: false
    });
  }

  // 2. Map ALL SPC items globally
  const globalSpcMap = new Map();
  for (const item of spcImports) {
    const asin = normalizeAsin(item.asin);
    if (!asin) continue;

    // Pass baseline global exclusions
    if (ignoredAsins.has(asin)) continue;
    if (activeDealAsins.has(asin)) continue;

    globalSpcMap.set(asin, {
      ...item,
      streams: item.streams || [SPC_DEFAULT_STREAM],
      sourceType: "spc",
      spcImported: true,
      spcCapturedAt: item.capturedAt || item.importedAt || ""
    });
  }

  const globalCrossovers = [];
  const globalDiscoveryOnly = [];

  // Pass 1: Extract cross-referenced items across ANY of the 3 streams
  for (const [asin, spcItem] of globalSpcMap.entries()) {
    if (globalDiscoveryMap.has(asin)) {
      const discItem = globalDiscoveryMap.get(asin);
      // Merge categories from both pools to preserve all stream indicators
      const mergedStreams = [...new Set([...(discItem.streams || []), ...(spcItem.streams || [])])];

      globalCrossovers.push({
        ...discItem,
        ...spcItem,
        asin,
        streams: mergedStreams,
        spcImported: true,
        sourceType: "spc"
      });
    }
  }

  // Pass 2: Extract remaining pure discovery items
  for (const [asin, discItem] of globalDiscoveryMap.entries()) {
    if (!globalSpcMap.has(asin)) {
      globalDiscoveryOnly.push(discItem);
    }
  }

  // --- LOCAL STREAM EXECUTION FILTERS ---

  // Filter prioritized items down to just the active command line stream execution run
  const localStreamCrossovers = globalCrossovers.filter(item => (item.streams || []).includes(STREAM_NAME));
  const localStreamDiscoveryOnly = globalDiscoveryOnly.filter(item => (item.streams || []).includes(STREAM_NAME));

  // Combine pools: Line up crossovers first, then fill remainder with pure discovery items
  const candidates = [...localStreamCrossovers, ...localStreamDiscoveryOnly].slice(0, ENRICH_LIMITS[STREAM_NAME]);

  console.log(`Stream Execution: ${STREAM_NAME}`);
  console.log(`Global Discovery Pool Size: ${discovered.length}`);
  console.log(`Global SPC Import Pool Size: ${spcImports.length}`);
  console.log(`Global Cross-Stream Crossovers Found: ${globalCrossovers.length}`);
  console.log(`Active Stream Crossovers Scheduled: ${localStreamCrossovers.length}`);
  console.log(`Total Candidates Chosen for Run: ${candidates.length}`);

  if (!candidates.length) {
    console.log(`No ${STREAM_NAME} ASINs waiting for enrichment.`);
    return;
  }

  const asins = candidates
    .map(item => normalizeAsin(item.asin))
    .filter(Boolean);

  const sourceMetaByAsin = new Map(
    candidates.map(item => [
      normalizeAsin(item.asin),
      {
        spcImported: Boolean(item.spcImported),
        spcCapturedAt: item.spcCapturedAt || ""
      }
    ])
  );

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
    .map(p => normalizeProduct(
      p,
      STREAM_NAME,
      sourceMetaByAsin.get(normalizeAsin(p.asin)) || {}
    ))
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
  console.log(`New valid SPC-backed deals: ${newDeals.filter(x => x.spcImported).length}`);
  console.log(`Total active enriched deals after parent-family dedupe: ${mergedDeals.length}`);
  console.log(`Marked ${enrichedSet.size} ASINs as enriched.`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
