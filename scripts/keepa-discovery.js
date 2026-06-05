const fs = require("fs");

const KEEPA_API_KEY = process.env.KEEPA_API_KEY;
const STREAM_NAME = process.argv[2];

const DISCOVERY_FILE = "data/discovered-asins.json";
const MAX_POOL_AGE_DAYS = 30;

if (!KEEPA_API_KEY) throw new Error("Missing KEEPA_API_KEY");
if (!STREAM_NAME) throw new Error("Missing stream argument");

const STREAMS = {

  power_tools_main: {
  name: "power_tools_main",
  selection: {
    productType: [0],
    singleVariation: true,

    current_SALES_gte: 1,
    current_SALES_lte: 100000,

    current_BUY_BOX_SHIPPING_gte: 2000,

    isLowest90_BUY_BOX_SHIPPING: true,
    deltaPercent30_BUY_BOX_SHIPPING_gte: 5,
    deltaPercent90_BUY_BOX_SHIPPING_gte: 5,

    rootCategory: [228013],

    brand: [
      "dewalt",
      "flex",
      "makita",
      "metabo hpt",
      "milwaukee",
      "skil",
      "skilsaw",
      "wen"
    ],

    perPage: 1000,
    page: 0
  }
},
  
  
  dudes_power: {
  name: "dudes_power",
  selection: {
    productType: [0],
    singleVariation: true,

    categories_exclude: [
      "7073956011",    // Portable Bluetooth Speakers
        "464394",      // USB Cables
  "3011391011"   // Laptop Accessories
    ],

    current_BUY_BOX_SHIPPING_gte: 3000,

    isLowest90_BUY_BOX_SHIPPING: true,

    brand: [
      "anker",
      "bluetti",
      "ecoflow",
      "goal zero",
      "jackery",
      "zendure"
    ],

    sort: [
      ["current_SALES", "asc"],
      ["monthlySold", "desc"]
    ],

    perPage: 1000,
    page: 0
  }
},

woodworking_core: {
  name: "woodworking_core",
  selection: {
    productType: [0],
    singleVariation: true,

    current_BUY_BOX_SHIPPING_gte: 3000,
    categories_exclude: [
     15684181, // Automotive
  15719731, // Replacement Parts
  15721631, // Brake System
  15730551, // Sensors
  15730891, // Oxygen Sensors
  15721811, // Brake Pads
  46244011, // Rotors
  15728151, // Electric Fuel Pumps
  9425850011, // Automotive Replacement Parts

  // Tool noise / low-intent replacement parts
  9022420011, // Power Tools Replacement Parts

  // Optional noise reducers
  256268011, // Masonry Core Drill Bits
  256276011, // Masonry Drill Bits
  8906591011, // Rotary Hammer Drill Bits
],

      
    isLowest90_BUY_BOX_SHIPPING: true,
deltaPercent90_BUY_BOX_SHIPPING_gte: 8,

    brand: [
      "woodpeckers",
      "jessem",
      "incra",
      "bessey",
      "fastcap",
      "amana tool",
      "whiteside",
      "freud",
      "mirka",
      "titebond",
      "bora",
      "pony",
      "jorgensen",
      "trend",
      "suizan",
      "festool",
      "microjig"
    ],

    categories_exclude: [
      // add after category report
    ],

    sort: [
      ["current_SALES", "asc"],
      ["monthlySold", "desc"]
    ],

    perPage: 1000,
    page: 0
  }
},  


woodworking_test: {
name: "woodworking_test",
selection: {
productType: [0],
singleVariation: true,

current_BUY_BOX_SHIPPING_gte: 3000,

isLowest90_BUY_BOX_SHIPPING: true,

deltaPercent90_BUY_BOX_SHIPPING_gte: 10,
deltaPercent30_BUY_BOX_SHIPPING_gte: 8,

categories_exclude: [
  511228,      // Hardware
  511276,      // Door Hardware & Locks
  2380871011,  // Cabinet Hardware
  511260,      // Pulls
  573760011,   // Door Levers
  573759011,   // Door Knobs
  511286,      // Hinges
  511240,      // Hinges
  511396,      // Tarps
  13399701,    // Spray Paint
  511382,      // Combination Padlocks
  511306,      // Deadbolts
  9628891011,  // Brackets
  335116011    // Bathroom Shelves
],

salesRank_lte: 100000,

  current_RATING_gte: 43,
  current_COUNT_REVIEWS_gte: 100,

categories_include: [
  // Clamping & Workholding
  553158,      // C-Clamps
  3207128011,  // Bar Clamps
  553152,      // Angle Clamps
  553153,      // Bench Clamps
  5739459011,  // Bench Vises

  // Routers
  552866,      // Routers

  // Sanders
  552888,      // Random-Orbit Sanders
  552880,      // Detail Sanders
  552886,      // Drum Sanders
  552882,      // Combination Disc & Belt Sanders
  552884,      // Disc Sanders

  // Cutting Tools
  552962,      // Table Saws
  552910,      // Band Saws
  552940,      // Miter Saws
  553220,      // Handsaws

  // Specialty Tools
  2445476011,  // Oscillating Tools
  8906593011,  // Wood Drill Bit Sets
  552936,      // Jig Accessories

  // Hand Tools
  21213614011, // Block Planes
  21213620011, // Smoothing Planes

  // Dust Collection
  553020,      // Dust Collectors & Air Cleaners
  553022,      // Wet-Dry Shop Vacuums

  // Shop Furniture
  553602       // Workbenches
],

sort: [
  ["current_SALES", "asc"]
],

page: 0,
perPage: 1000

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
    productType: [0],

    singleVariation: true,

    current_BUY_BOX_SHIPPING_gte: 2000,

    isLowest90_BUY_BOX_SHIPPING: true,

    categories_exclude: [
  "6066131011"
],

    brand: [
      "bambu lab",
      "prusa",
      "creality",
      "elegoo",
      "anycubic",
      "flashforge",
      "qidi tech",
      "sunlu",
      "esun",
      "polymaker",
      "overture",
      "hatchbox",
      "micro swiss",
      "bigtreetech"
    ],

    sort: [
      ["current_SALES", "asc"],
      ["monthlySold", "desc"]
    ],

    perPage: 1000,
    page: 0
  }
},

deals_for_dudes: {
  name: "deals_for_dudes",
  selection: {
    productType: [0],

    rootCategory: [
      "228013",
      "16310091"
    ],

    categories_exclude: [
      "172435",
      "172526",
      "172574",
      "3011391011",
      "3248684011",
      "502394",
      "524136",
      "6684132011",
"3180261",
"2445457011",
"553222",
"553232"
    ],

    current_SALES_gte: 1,
    current_SALES_lte: 150000,
current_RATING_gte: 42,
current_COUNT_REVIEWS_gte: 75,
current_BUY_BOX_SHIPPING_gte: 2000,

isLowest90_BUY_BOX_SHIPPING: true,
deltaPercent90_BUY_BOX_SHIPPING_gte: 10,

   

    categories_include: [
  "289810",
  "541966",
  "551242",
  "552808",
  "553760"
],

    sort: [
      ["deltaPercent90_BUY_BOX_SHIPPING", "desc"],
      ["current_SALES", "asc"]
    ],

    page: 0,
    perPage: 500
  },

  title_include_any: [
  "knife",
  "multitool",
  "multi-tool",
  "flashlight",
  "headlamp",
  "wallet",
  "backpack",
  "cooler",
  "grill",
  "griddle",
  "smoker",
  "thermometer",
  "power station",
  "power bank",
  "charger",
  "bluetooth",
  "speaker",
  "headphones",
  "earbuds",
  "gaming",
  "controller",
  "monitor",
  "keyboard",
  "mouse",
  "dash cam",
  "jump starter",
  "air compressor",
  "socket",
  "ratchet",
  "tool bag",
  "work light",
  "camping",
  "hiking",
  "watch",
  "smartwatch",
  "yeti",
  "rtic",
  "blackstone",
  "weber",
  "traeger",
  "meater",
  "solo stove",
  "anker",
  "jackery",
  "ecoflow",
  "leatherman",
  "gerber",
  "victorinox",
  "streamlight",
  "olight",
  "garmin"
  ],

  title_exclude_any: [
    "case for",
    "screen protector",
    "replacement",
    "refill",
    "filter replacement",
    "cover only",
    "for kids",
    "baby",
    "toddler",
    "women",
    "girls",
    "makeup",
    "skincare",
    "hair",
    "nail",
    "toilet",
    "faucet",
    "shower",
    "curtain",
    "pillow",
    "blanket",
    "decor",
    "party",
    "costume",
    "pet",
    "dog",
    "cat",
"flashlight",
  "flash light",
  "headlamp",
  "head lamp",
  "work light",
  "inspection light",
  "tactical light",
  "pocket knife",
  "folding knife",
  "knife",
  "knives",
  "blade",
  "edc"
  ]
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

  lastEnrichedAt: item.lastEnrichedAt || item.enrichedAt || null,
  enrichedAt: item.enrichedAt || item.lastEnrichedAt || null,
  lastEnrichedStream: item.lastEnrichedStream || "",

  parentAsin: item.parentAsin || "",
  familyKey: item.familyKey || item.parentAsin || asin,
  variationCount: item.variationCount || 0
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
