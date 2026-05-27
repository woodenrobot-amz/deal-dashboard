const fs = require("fs");

const KEEPA_API_KEY = process.env.KEEPA_API_KEY;
const STREAM_NAME = process.argv[2];

const DISCOVERY_FILE = "data/discovered-asins.json";
const MAX_POOL_AGE_DAYS = 30;

if (!KEEPA_API_KEY) throw new Error("Missing KEEPA_API_KEY");
if (!STREAM_NAME) throw new Error("Missing stream argument");

const STREAMS = {
woodworking_core: {
  name: "woodworking_core",
  selection: {
    productType: [0],

    categories_exclude: [
      "13749581",
      "3754161",
      "495224",
      "551240",
      "680350011"
    ],

    current_SALES_gte: 1,
    current_SALES_lte: 100000,
    current_RATING_gte: 43,
    current_COUNT_REVIEWS_gte: 100,
    current_BUY_BOX_SHIPPING_gte: 3500,

    isLowest90_BUY_BOX_SHIPPING: true,
    deltaPercent90_BUY_BOX_SHIPPING_gte: 8,

    rootCategory: ["228013"],

    categories_include: [
      "3116511",
      "551238",
      "552262",
      "552286",
      "553022",
      "553244",
      "553332",
      "979147011"
    ],

    sort: [
      ["current_SALES", "asc"],
      ["monthlySold", "desc"]
    ],

    lastRatingUpdate_gte: 7958651,
    perPage: 1000,
    page: 0
  }
},
  
  woodworking: {
    name: "woodworking",
    selection: {
      categories_exclude: [
        "13399871", "13749581", "15569906011", "157681011", "17515060011",
        "2225057011", "495346", "553140", "553242", "553348", "553350",
        "553392", "553406", "553422"
      ],
      current_SALES_gte: 1,
      current_SALES_lte: 200000,
      current_RATING_gte: 42,
      current_COUNT_REVIEWS_gte: 50,
      isLowest90_BUY_BOX_SHIPPING: true,
      deltaPercent90_BUY_BOX_SHIPPING_gte: 5,
      deltaPercent30_BUY_BOX_SHIPPING_gte: 5,
      rootCategory: ["16310091", "228013"],
      productType: [0],
      variationReviewCount_gte: 1,
      categories_include: [
        "2399141011", "3116511", "551236", "551238", "552318", "552342",
        "552578", "552580", "552648", "552780", "552794", "552824", "552842",
        "552866", "552910", "552940", "552942", "552962", "552964", "553022",
        "553150", "553218", "553244", "553142", "383663011", "16412291"
      ],
      sort: [["current_SALES", "asc"], ["monthlySold", "desc"]],
      lastRatingUpdate_gte: 7953123,
      page: 0,
      perPage: 3000
    }
  },

  three_d_printing: {
    name: "three_d_printing",
    selection: {
      categories_exclude: ["8481415011"],
      current_SALES_gte: 1,
      current_SALES_lte: 200000,
      isLowest_BUY_BOX_SHIPPING: true,
      isLowest90_BUY_BOX_SHIPPING: true,
      deltaPercent90_BUY_BOX_SHIPPING_gte: 5,
      rootCategory: ["16310091"],
      categories_include: ["6066126011"],
      sort: [["current_SALES", "asc"], ["monthlySold", "desc"]],
      productType: [0],
      page: 0,
      perPage: 3000
    }
  },

deals_for_dudes: {
  name: "deals_for_dudes",
  selection: {
    categories_exclude: [
      "172435", "172526", "172574", "3011391011",
      "3248684011", "502394", "524136", "6684132011",

      // Add more known noisy grilling / computer / tablet categories here
      // after reviewing Keepa category names
    ],
    current_SALES_gte: 1,
    current_SALES_lte: 150000,
    current_RATING_gte: 42,
    current_COUNT_REVIEWS_gte: 75,
    isLowest90_BUY_BOX_SHIPPING: true,
    deltaPercent7_BUY_BOX_SHIPPING_gte: 8,
    deltaPercent90_BUY_BOX_SHIPPING_gte: 12,

    rootCategory: [
      "228013",
      "16310091"
    ],

    categories_include: [
      "289810",
      "3180261",
      "541966",
      "551242",
      "552808",
      "553232",
      "553760"
    ],

    sort: [["current_SALES", "asc"], ["monthlySold", "desc"]],
    lastRatingUpdate_gte: 7952433,
    productType: [0],
    page: 0,
    perPage: 3000
  }
}  
        
};

const stream = STREAMS[STREAM_NAME];
if (!stream) throw new Error(`Unknown stream: ${STREAM_NAME}`);

function buildQueryUrl(selection) {
  return (
    `https://api.keepa.com/query?key=${KEEPA_API_KEY}` +
    `&domain=1` +
    `&selection=${encodeURIComponent(JSON.stringify(selection))}`
  );
}

function readExistingDiscovery() {
  try {
    if (!fs.existsSync(DISCOVERY_FILE)) return [];

    const parsed = JSON.parse(fs.readFileSync(DISCOVERY_FILE, "utf8"));

    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.asins)) return parsed.asins;

    return [];
  } catch (err) {
    console.warn("Could not read existing discovery file. Starting fresh.");
    return [];
  }
}

function daysBetween(dateA, dateB) {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();

  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;

  return Math.abs(b - a) / (1000 * 60 * 60 * 24);
}

function pruneOldItems(items, now) {
  return items.filter(item => {
    if (!item.lastSeenAt) return true;
    return daysBetween(item.lastSeenAt, now) <= MAX_POOL_AGE_DAYS;
  });
}

function mergeDiscovery(existingItems, newItems, now, streamName) {
  const map = new Map();

  for (const item of existingItems) {
    const asin = String(item.asin || "").trim();
    if (!asin) continue;

    map.set(asin, {
      asin,
      streams: Array.isArray(item.streams) ? item.streams : [],
      discoveredAt: item.discoveredAt || now,
      lastSeenAt: item.lastSeenAt || item.discoveredAt || now,
      timesSeen: Number.isFinite(item.timesSeen) ? item.timesSeen : 1,
      streamStats: item.streamStats || {},
      ignored: Boolean(item.ignored),
      lastEnrichedAt: item.lastEnrichedAt || null
    });
  }

  for (const item of newItems) {
    const asin = String(item.asin || "").trim();
    if (!asin) continue;

    const existing = map.get(asin);

    if (!existing) {
      map.set(asin, {
        asin,
        streams: [streamName],
        discoveredAt: now,
        lastSeenAt: now,
        timesSeen: 1,
        streamStats: {
          [streamName]: {
            firstSeenAt: now,
            lastSeenAt: now,
            timesSeen: 1
          }
        },
        ignored: false,
        lastEnrichedAt: null
      });
      continue;
    }

    const streamStats = existing.streamStats || {};
    const currentStreamStats = streamStats[streamName] || {
      firstSeenAt: now,
      lastSeenAt: now,
      timesSeen: 0
    };

    map.set(asin, {
      ...existing,
      asin,
      streams: [...new Set([...(existing.streams || []), streamName])],
      discoveredAt: existing.discoveredAt || now,
      lastSeenAt: now,
      timesSeen: (existing.timesSeen || 0) + 1,
      streamStats: {
        ...streamStats,
        [streamName]: {
          firstSeenAt: currentStreamStats.firstSeenAt || now,
          lastSeenAt: now,
          timesSeen: (currentStreamStats.timesSeen || 0) + 1
        }
      }
    });
  }

  return [...map.values()];
}

function sortDiscoveryPool(items) {
  return [...items].sort((a, b) => {
    const aSeen = a.timesSeen || 0;
    const bSeen = b.timesSeen || 0;

    if (bSeen !== aSeen) return bSeen - aSeen;

    return new Date(b.lastSeenAt || 0) - new Date(a.lastSeenAt || 0);
  });
}

async function run() {
  console.log(`Starting discovery for ${stream.name}`);

  const res = await fetch(buildQueryUrl(stream.selection));

  if (!res.ok) {
    throw new Error(`Keepa request failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  if (data.error) {
    throw new Error(JSON.stringify(data.error));
  }

  const now = new Date().toISOString();

  const newItems = (data.asinList || []).map(asin => ({
    asin: String(asin || "").trim()
  })).filter(item => item.asin);

  const existing = readExistingDiscovery();
  const merged = mergeDiscovery(existing, newItems, now, stream.name);
  const pruned = pruneOldItems(merged, now);
  const sorted = sortDiscoveryPool(pruned);

  fs.mkdirSync("data", { recursive: true });

  fs.writeFileSync(
    DISCOVERY_FILE,
    JSON.stringify({
      generatedAt: now,
      lastDiscoveryStream: stream.name,
      maxPoolAgeDays: MAX_POOL_AGE_DAYS,
      totalDiscovered: sorted.length,
      tokensConsumed: data.tokensConsumed ?? null,
      tokensLeft: data.tokensLeft ?? null,
      asins: sorted
    }, null, 2)
  );

  console.log(`${stream.name}: found ${newItems.length} ASINs`);
  console.log(`Existing pool before merge: ${existing.length}`);
  console.log(`Discovery pool after merge/prune: ${sorted.length}`);
  console.log(`Tokens consumed: ${data.tokensConsumed}`);
  console.log(`Tokens left: ${data.tokensLeft}`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
