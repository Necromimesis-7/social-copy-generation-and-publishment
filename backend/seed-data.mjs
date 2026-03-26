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

export const seedProjects = [];

export function createDefaultProjectData(name = "New Brand") {
  return {
    name,
    brandSummary: "",
    audience: "",
    tone: "",
    defaultLanguage: "en",
    bannedPhrases: [],
    accounts: [],
    samples: [],
  };
}
