const DEFAULT_BASE_URL = "https://app.metricool.com/api";

export const METRICOOL_NETWORK_BY_PLATFORM = {
  X: "twitter",
  Instagram: "instagram",
  TikTok: "tiktok",
  YouTube: "youtube",
};

export function getMetricoolConfig() {
  const token = String(process.env.METRICOOL_API_TOKEN || "").trim();
  const userId = String(process.env.METRICOOL_USER_ID || "").trim();
  const baseUrl = String(process.env.METRICOOL_BASE_URL || DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL;
  const configuredPublicAppUrl = String(process.env.PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  const renderHostname = String(process.env.RENDER_EXTERNAL_HOSTNAME || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const publicAppUrl = configuredPublicAppUrl || (renderHostname ? `https://${renderHostname}` : "");

  return {
    token,
    userId,
    baseUrl,
    publicAppUrl,
    configured: Boolean(token && userId),
  };
}

function getRequiredConfig() {
  const config = getMetricoolConfig();
  if (!config.configured) {
    const error = new Error("Metricool API is not configured. Set METRICOOL_API_TOKEN and METRICOOL_USER_ID.");
    error.statusCode = 400;
    throw error;
  }

  return config;
}

function buildMetricoolUrl(pathname, { userId, blogId, query = {} } = {}) {
  const { baseUrl } = getRequiredConfig();
  const url = new URL(pathname.replace(/^\//, ""), `${baseUrl.replace(/\/+$/, "")}/`);

  if (userId) {
    url.searchParams.set("userId", String(userId));
  }

  if (blogId) {
    url.searchParams.set("blogId", String(blogId));
  }

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    url.searchParams.set(key, String(value));
  });

  return url;
}

function unwrapMetricoolPayload(payload) {
  if (payload && typeof payload === "object" && "data" in payload) {
    return payload.data;
  }

  return payload;
}

async function metricoolRequest(pathname, options = {}) {
  const { token, userId: defaultUserId } = getRequiredConfig();
  const userId = options.userId || defaultUserId;
  const url = buildMetricoolUrl(pathname, {
    userId,
    blogId: options.blogId,
    query: options.query,
  });

  const headers = {
    "X-Mc-Auth": token,
    ...(options.expectText ? {} : { "Content-Type": "application/json" }),
  };

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.json ? JSON.stringify(options.json) : undefined,
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    const detail = raw.trim() || `HTTP ${response.status}`;
    const error = new Error(`Metricool request failed: ${detail}`);
    error.statusCode = response.status;
    throw error;
  }

  if (options.expectText) {
    return response.text();
  }

  const payload = await response.json().catch(() => ({}));
  return unwrapMetricoolPayload(payload);
}

export async function listMetricoolBrands() {
  return metricoolRequest("/admin/simpleProfiles");
}

export async function createMetricoolScheduledPost({ blogId, scheduledPost }) {
  return metricoolRequest("/v2/scheduler/posts", {
    method: "POST",
    blogId,
    json: scheduledPost,
  });
}

export async function normalizeMetricoolImageUrl({ blogId, assetUrl }) {
  return metricoolRequest("/actions/normalize/image/url", {
    blogId,
    query: { url: assetUrl },
    expectText: true,
  });
}

export function mapMetricoolBrandChannels(brand = {}) {
  return {
    X: brand.twitter || "",
    Instagram: brand.instagram || "",
    TikTok: brand.tiktok || "",
    YouTube: brand.youtubeChannelName || brand.youtube || "",
  };
}

export function formatMetricoolBrands(brands = []) {
  return (Array.isArray(brands) ? brands : []).map((brand) => ({
    blogId: String(brand.id || ""),
    userId: String(brand.userId || ""),
    label: brand.label || brand.title || `Brand ${brand.id || ""}`.trim(),
    timezone: brand.timezone || "",
    channels: mapMetricoolBrandChannels(brand),
    raw: brand,
  }));
}
