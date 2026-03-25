export const platformOrder = ["X", "Instagram", "TikTok", "YouTube"];

const platformDefaults = {
  X: {
    enabled: true,
    length: "short",
    cta: false,
    hashtags: false,
    notes: "Lead with one sharp point and keep the pace tight.",
  },
  Instagram: {
    enabled: true,
    length: "medium",
    cta: true,
    hashtags: true,
    notes: "Blend visual texture with a clear brand feeling.",
  },
  TikTok: {
    enabled: true,
    length: "short",
    cta: false,
    hashtags: true,
    notes: "Make the hook immediate and native to short-form video.",
  },
  YouTube: {
    enabled: true,
    length: "medium",
    cta: true,
    hashtags: false,
    notes: "Keep the title clean and use the description to add context.",
  },
};

function slugify(value) {
  return String(value || "brand")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18) || "brand";
}

function platformSuffix(platform) {
  if (platform === "Instagram") {
    return "ig";
  }

  if (platform === "TikTok") {
    return "tt";
  }

  if (platform === "YouTube") {
    return "yt";
  }

  return "x";
}

export function createDefaultAccount(platform = "Instagram", baseName = "New Brand", index = 0) {
  const defaults = platformDefaults[platform] || platformDefaults.Instagram;
  const baseSlug = slugify(baseName);
  const suffix = platformSuffix(platform);

  return {
    platform,
    accountName: `${baseName} ${platform}${index > 0 ? ` ${index + 1}` : ""}`,
    handle: `@${baseSlug}-${suffix}${index > 0 ? `-${index + 1}` : ""}`,
    enabled: defaults.enabled,
    length: defaults.length,
    cta: defaults.cta,
    hashtags: defaults.hashtags,
    notes: defaults.notes,
  };
}

export function createDefaultAccounts(baseName = "New Brand") {
  return platformOrder.map((platform) => createDefaultAccount(platform, baseName));
}

export const seedProjects = [
  {
    id: "northstar",
    name: "Northstar Skin",
    brandSummary:
      "Clinical skincare brand for busy professionals who want visible results without a twelve-step routine.",
    audience: "Women 26-38 in US and UK",
    tone: "Assured, clean, credible, lightly conversational",
    defaultLanguage: "en",
    bannedPhrases: ["miracle cure", "instant perfection"],
    accounts: [
      {
        id: "northstar-x-main",
        platform: "X",
        accountName: "Northstar Skin Main",
        handle: "@northstarskin",
        enabled: true,
        length: "short",
        cta: true,
        hashtags: false,
        notes: "Lead with one strong insight and keep it punchy.",
      },
      {
        id: "northstar-x-lab",
        platform: "X",
        accountName: "Northstar Lab Notes",
        handle: "@northstarlab",
        enabled: true,
        length: "short",
        cta: false,
        hashtags: false,
        notes: "Lean more educational and slightly more technical.",
      },
      {
        id: "northstar-ig-main",
        platform: "Instagram",
        accountName: "Northstar Skin",
        handle: "@northstarskin",
        enabled: true,
        length: "medium",
        cta: true,
        hashtags: true,
        notes: "Blend product feel with routine storytelling.",
      },
      {
        id: "northstar-tiktok-main",
        platform: "TikTok",
        accountName: "Northstar Skin TikTok",
        handle: "@northstarskin",
        enabled: true,
        length: "short",
        cta: false,
        hashtags: true,
        notes: "Make it fast, clear, and natively casual.",
      },
      {
        id: "northstar-youtube-main",
        platform: "YouTube",
        accountName: "Northstar Skin Channel",
        handle: "@northstarskin",
        enabled: true,
        length: "medium",
        cta: true,
        hashtags: false,
        notes: "Title should be crisp. Description can explain the payoff.",
      },
    ],
    samples: [
      {
        id: "sample-1",
        platform: "Instagram",
        accountId: "northstar-ig-main",
        accountLabel: "@northstarskin",
        mode: "link",
        url: "https://instagram.com/p/demo-1",
        body: "A calmer routine starts with fewer, better steps. This is the serum we reach for when skin looks tired by 4pm.",
        publishedAt: "2026-03-15T09:00:00.000Z",
      },
      {
        id: "sample-2",
        platform: "X",
        accountId: "northstar-x-lab",
        accountLabel: "@northstarlab",
        mode: "manual",
        url: "",
        body: "If a product needs ten caveats to explain why it works, it probably does not belong in your daily routine.",
        publishedAt: "2026-03-11T09:00:00.000Z",
      },
      {
        id: "sample-3",
        platform: "YouTube",
        accountId: null,
        accountLabel: "",
        mode: "manual",
        url: "",
        body: "Skin education works best when the headline is simple and the payoff is easy to scan.",
        publishedAt: "2026-03-09T09:00:00.000Z",
      },
    ],
  },
  {
    id: "atlas",
    name: "Atlas Carry",
    brandSummary:
      "Travel gear brand focused on modular bags and accessories for frequent flyers and remote workers.",
    audience: "Frequent travelers and remote professionals 24-42",
    tone: "Direct, design-aware, practical",
    defaultLanguage: "en",
    bannedPhrases: ["game changer"],
    accounts: [
      {
        id: "atlas-x-main",
        platform: "X",
        accountName: "Atlas Carry Main",
        handle: "@atlascarry",
        enabled: true,
        length: "short",
        cta: false,
        hashtags: false,
        notes: "Use a sharp utility angle.",
      },
      {
        id: "atlas-instagram-main",
        platform: "Instagram",
        accountName: "Atlas Carry Lifestyle",
        handle: "@atlascarry",
        enabled: true,
        length: "medium",
        cta: true,
        hashtags: true,
        notes: "Make the product feel tactile and mobile.",
      },
      {
        id: "atlas-instagram-pro",
        platform: "Instagram",
        accountName: "Atlas Carry Pro",
        handle: "@atlascarry.pro",
        enabled: true,
        length: "medium",
        cta: true,
        hashtags: false,
        notes: "Lean more utility-first and less lifestyle-heavy.",
      },
      {
        id: "atlas-tiktok-main",
        platform: "TikTok",
        accountName: "Atlas Carry TikTok",
        handle: "@atlascarry",
        enabled: true,
        length: "short",
        cta: false,
        hashtags: true,
        notes: "Show the travel hack immediately.",
      },
      {
        id: "atlas-youtube-main",
        platform: "YouTube",
        accountName: "Atlas Carry Channel",
        handle: "@atlascarry",
        enabled: true,
        length: "medium",
        cta: true,
        hashtags: false,
        notes: "Lean into title clarity and scenario framing.",
      },
    ],
    samples: [
      {
        id: "sample-4",
        platform: "TikTok",
        accountId: "atlas-tiktok-main",
        accountLabel: "@atlascarry",
        mode: "manual",
        url: "",
        body: "When your bag opens flat, airport security gets a lot less chaotic.",
        publishedAt: "2026-03-13T09:00:00.000Z",
      },
      {
        id: "sample-5",
        platform: "Instagram",
        accountId: "atlas-instagram-pro",
        accountLabel: "@atlascarry.pro",
        mode: "manual",
        url: "",
        body: "A carry system should earn its space on the move, not just in a studio shot.",
        publishedAt: "2026-03-12T09:00:00.000Z",
      },
    ],
  },
];

export function createDefaultProjectData(name = "New Brand") {
  return {
    name,
    brandSummary: "Describe the brand promise, product angle, and why the audience should care.",
    audience: "Define the target audience",
    tone: "Clear, brand-specific, useful",
    defaultLanguage: "en",
    bannedPhrases: [],
    accounts: createDefaultAccounts(name),
    samples: [],
  };
}
