import "./backend/env.mjs";

import { randomUUID } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import http from "node:http";
import { DatabaseSync } from "node:sqlite";

import { generateDraftPackage, getGeneratorMode } from "./backend/generator.mjs";
import { getVideoProcessingCapabilities, processStoredAsset } from "./backend/media-processing.mjs";
import {
  createMetricoolScheduledPost,
  formatMetricoolBrands,
  getMetricoolConfig,
  listMetricoolBrands,
  mapMetricoolBrandChannels,
  METRICOOL_NETWORK_BY_PLATFORM,
  normalizeMetricoolImageUrl,
} from "./backend/metricool-client.mjs";
import { isUsableSampleText } from "./backend/sample-quality.mjs";
import { normalizeReviewStatus, normalizeSampleType } from "./backend/sample-reference.mjs";
import { importSamplesFromUrl } from "./backend/sample-importer.mjs";
import { formatGenerationTypeLabel, normalizeGenerationType } from "./backend/target-outputs.mjs";
import { researchTrendingContext } from "./backend/trend-research.mjs";
import {
  createDefaultAccount,
  createDefaultProjectData,
  platformOrder,
  seedProjects,
} from "./backend/seed-data.mjs";

const publicRoot = join(process.cwd(), "public");
const dataRoot = process.env.DATA_ROOT
  ? normalize(process.env.DATA_ROOT)
  : join(process.cwd(), "data");
const uploadRoot = join(dataRoot, "uploads");
const dbPath = join(dataRoot, "app.db");
const port = Number(process.env.PORT || 4173);
const publishPollIntervalMs = Math.max(5000, Number(process.env.PUBLISH_POLL_INTERVAL_MS || 15000));

mkdirSync(uploadRoot, { recursive: true });

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const uiToDbPlatform = {
  General: "general",
  X: "x",
  Instagram: "instagram",
  TikTok: "tiktok",
  YouTube: "youtube",
};

const dbToUiPlatform = Object.fromEntries(Object.entries(uiToDbPlatform).map(([key, value]) => [value, key]));
const activeGenerations = new Map();
let publishLoopRunning = false;

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON;");

initSchema();
seedDatabase();
migrateLegacyPlatformsToAccounts();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    serveStatic(req, res, url);
  } catch (error) {
    if (!error?.statusCode || error.statusCode >= 500) {
      console.error(error);
    }
    sendJson(res, error.statusCode || 500, {
      error: error.statusCode ? error.message : "Internal server error",
    });
  }
});

server.listen(port, () => {
  console.log(`App running at http://localhost:${port}`);
});

startPublishDispatcher();

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      brand_summary TEXT NOT NULL,
      audience TEXT NOT NULL,
      tone TEXT NOT NULL,
      default_language TEXT NOT NULL,
      banned_phrases TEXT NOT NULL DEFAULT '[]',
      metricool_blog_id TEXT NOT NULL DEFAULT '',
      metricool_brand_label TEXT NOT NULL DEFAULT '',
      metricool_brand_timezone TEXT NOT NULL DEFAULT '',
      metricool_brand_channels_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_platforms (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      preferred_length TEXT NOT NULL,
      cta_enabled INTEGER NOT NULL DEFAULT 0,
      hashtag_enabled INTEGER NOT NULL DEFAULT 0,
      style_notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, platform)
    );

    CREATE TABLE IF NOT EXISTS project_accounts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      account_name TEXT NOT NULL,
      handle TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      preferred_length TEXT NOT NULL,
      cta_enabled INTEGER NOT NULL DEFAULT 0,
      hashtag_enabled INTEGER NOT NULL DEFAULT 0,
      style_notes TEXT NOT NULL DEFAULT '',
      metricool_publish_enabled INTEGER NOT NULL DEFAULT 0,
      metricool_network TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS content_samples (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source_platform TEXT NOT NULL,
      import_method TEXT NOT NULL,
      source_url TEXT,
      published_at TEXT,
      body TEXT NOT NULL,
      sample_type TEXT NOT NULL DEFAULT 'general',
      review_status TEXT NOT NULL DEFAULT 'accepted',
      updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS generation_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      asset_mode TEXT NOT NULL,
      asset_summary TEXT NOT NULL,
      sample_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      generation_id TEXT,
      asset_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      extracted_summary TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (generation_id) REFERENCES generation_runs(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS generation_outputs (
      id TEXT PRIMARY KEY,
      generation_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      candidate_index INTEGER NOT NULL DEFAULT 0,
      title TEXT,
      body TEXT,
      is_preferred INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (generation_id) REFERENCES generation_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS publish_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      output_id TEXT NOT NULL,
      generation_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      account_label TEXT NOT NULL DEFAULT '',
      platform TEXT NOT NULL,
      provider_network TEXT NOT NULL,
      mode TEXT NOT NULL,
      scheduled_for TEXT NOT NULL,
      publish_title TEXT NOT NULL DEFAULT '',
      publish_body TEXT NOT NULL DEFAULT '',
      media_urls_json TEXT NOT NULL DEFAULT '[]',
      metricool_blog_id TEXT NOT NULL DEFAULT '',
      metricool_post_id TEXT NOT NULL DEFAULT '',
      metricool_post_uuid TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      error_message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      submitted_at TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (generation_id) REFERENCES generation_runs(id) ON DELETE CASCADE,
      FOREIGN KEY (output_id) REFERENCES generation_outputs(id) ON DELETE CASCADE
    );
  `);

  ensureColumn("content_samples", "account_id", "TEXT");
  ensureColumn("content_samples", "account_label", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("content_samples", "sample_type", "TEXT NOT NULL DEFAULT 'general'");
  ensureColumn("content_samples", "review_status", "TEXT NOT NULL DEFAULT 'accepted'");
  ensureColumn("content_samples", "updated_at", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("generation_runs", "provider", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("generation_runs", "cancel_requested", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("generation_runs", "generation_type", "TEXT NOT NULL DEFAULT 'general'");
  ensureColumn("generation_runs", "asset_insights_json", "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn("generation_outputs", "account_id", "TEXT");
  ensureColumn("generation_outputs", "account_label", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("projects", "metricool_blog_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("projects", "metricool_brand_label", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("projects", "metricool_brand_timezone", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("projects", "metricool_brand_channels_json", "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn("project_accounts", "metricool_publish_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("project_accounts", "metricool_network", "TEXT NOT NULL DEFAULT ''");
}

function seedDatabase() {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM projects").get();
  if (existing.count > 0) {
    return;
  }

  seedProjects.forEach((project) => {
    insertProject(project, { preserveId: true });
  });
}

function hasColumn(tableName, columnName) {
  return db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .some((column) => column.name === columnName);
}

function ensureColumn(tableName, columnName, definition) {
  if (!hasColumn(tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function migrateLegacyPlatformsToAccounts() {
  const projects = db.prepare("SELECT id, name FROM projects").all();

  projects.forEach((project) => {
    const existingAccounts = db
      .prepare("SELECT COUNT(*) AS count FROM project_accounts WHERE project_id = ?")
      .get(project.id);

    if (existingAccounts.count > 0) {
      return;
    }

    const legacyRows = db
      .prepare(`
        SELECT * FROM project_platforms
        WHERE project_id = ?
      `)
      .all(project.id);

    if (!legacyRows.length) {
      return;
    }

    const migratedAccounts = legacyRows.map((row, index) => ({
      id: randomUUID(),
      platform: row.platform,
      accountName: `${project.name} ${row.platform}`,
      handle: createDefaultAccount(row.platform, project.name, index).handle,
      enabled: Boolean(row.enabled),
      length: row.preferred_length || createDefaultAccount(row.platform, project.name, index).length,
      cta: Boolean(row.cta_enabled),
      hashtags: Boolean(row.hashtag_enabled),
      notes: row.style_notes || createDefaultAccount(row.platform, project.name, index).notes,
    }));

    migratedAccounts.forEach((account) => {
      upsertAccount(project.id, account);
    });
  });
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean);

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      generatorMode: getGeneratorMode(),
      videoProcessing: getVideoProcessingCapabilities(),
      metricool: {
        configured: getMetricoolConfig().configured,
      },
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/integrations/metricool/brands") {
    const brands = await syncMetricoolBrands();
    sendJson(res, 200, { brands });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/projects") {
    sendAppState(res, 200, url.searchParams.get("activeProjectId"));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/projects") {
    const body = await readJson(req);
    const baseName = body?.name?.trim() || "New Brand";
    const projectId = insertProject(
      {
        id: randomUUID(),
        ...createDefaultProjectData(baseName),
        name: baseName,
      },
      { preserveId: true },
    );
    sendAppState(res, 201, projectId);
    return;
  }

  if (parts[1] === "projects" && parts[2]) {
    const projectId = parts[2];

    if (req.method === "DELETE" && parts.length === 3) {
      deleteProject(projectId);
      sendAppState(res, 200);
      return;
    }

    if (req.method === "PUT" && parts.length === 3) {
      const body = await readJson(req);
      updateProject(projectId, body);
      sendAppState(res, 200, projectId);
      return;
    }

    if (req.method === "POST" && parts[3] === "clone") {
      const clonedId = cloneProject(projectId);
      sendAppState(res, 201, clonedId);
      return;
    }

    if (req.method === "POST" && parts[3] === "samples") {
      const body = await readJson(req);
      await addSample(projectId, body);
      sendAppState(res, 201, projectId);
      return;
    }

    if (req.method === "DELETE" && parts[3] === "samples" && parts[4]) {
      removeSample(projectId, parts[4]);
      sendAppState(res, 200, projectId);
      return;
    }

    if (req.method === "PUT" && parts[3] === "samples" && parts[4]) {
      const body = await readJson(req);
      updateSample(projectId, parts[4], body);
      sendAppState(res, 200, projectId);
      return;
    }

    if (req.method === "POST" && parts[3] === "generations" && parts[4] === "cancel") {
      cancelActiveGeneration(projectId);
      sendAppState(res, 200, projectId);
      return;
    }

    if (req.method === "POST" && parts[3] === "generations") {
      await createGeneration(projectId, req);
      sendAppState(res, 201, projectId);
      return;
    }

    if (req.method === "PUT" && parts[3] === "outputs" && parts[4]) {
      const body = await readJson(req);
      updateGenerationOutput(projectId, parts[4], body);
      sendAppState(res, 200, projectId);
      return;
    }

    if (req.method === "POST" && parts[3] === "publish-jobs") {
      const body = await readJson(req);
      await createPublishJob(projectId, body);
      sendAppState(res, 201, projectId);
      return;
    }
  }

  sendJson(res, 404, { error: "Route not found" });
}

function sendAppState(res, statusCode, activeProjectId = null) {
  const projects = listProjects();
  const resolvedActiveId = activeProjectId || projects[0]?.id || null;
  sendJson(res, statusCode, {
    projects,
    activeProjectId: resolvedActiveId,
    generatorMode: getGeneratorMode(),
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function serveStatic(req, res, url) {
  if (!["GET", "HEAD"].includes(req.method || "GET")) {
    res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    res.end("Method not allowed");
    return;
  }

  const urlPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = safePath.startsWith("/uploads/")
    ? join(uploadRoot, safePath.replace(/^\/uploads\//, ""))
    : join(publicRoot, safePath);

  if (!existsSync(filePath)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const type = contentTypes[extname(filePath)] || "application/octet-stream";
  res.writeHead(200, { "content-type": type });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  createReadStream(filePath).pipe(res);
}

async function readJson(req) {
  if (!req.headers["content-type"]?.includes("application/json")) {
    return {};
  }

  const request = new Request("http://localhost/internal", {
    method: req.method,
    headers: req.headers,
    body: req,
    duplex: "half",
  });

  return request.json();
}

async function readFormData(req) {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("multipart/form-data") && !contentType.includes("application/x-www-form-urlencoded")) {
    throw httpError(400, "Upload assets using multipart form data.");
  }

  const request = new Request("http://localhost/internal", {
    method: req.method,
    headers: req.headers,
    body: req,
    duplex: "half",
  });

  return request.formData();
}

function nowIso() {
  return new Date().toISOString();
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function sanitizeFileName(value) {
  const clean = String(value || "upload.bin").replace(/[^a-zA-Z0-9._-]/g, "-");
  return clean || "upload.bin";
}

function getProjectRow(projectId) {
  return db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
}

function getProjectAccountRows(projectId) {
  return db
    .prepare(`
      SELECT * FROM project_accounts
      WHERE project_id = ?
      ORDER BY updated_at DESC, created_at DESC
    `)
    .all(projectId);
}

function sortAccounts(accounts = []) {
  return [...accounts].sort((left, right) => {
    const platformDelta = platformSortValue(left.platform) - platformSortValue(right.platform);
    if (platformDelta !== 0) {
      return platformDelta;
    }

    return `${left.accountName} ${left.handle}`.localeCompare(`${right.accountName} ${right.handle}`);
  });
}

function getAccountLabel(account) {
  if (!account) {
    return "";
  }

  return account.handle || account.accountName || `${account.platform} account`;
}

function legacyPlatformsToAccounts(platforms = {}, projectName = "New Brand") {
  return platformOrder
    .filter((platform) => platforms[platform])
    .map((platform, index) => {
      const defaults = createDefaultAccount(platform, projectName, index);
      const current = platforms[platform] || {};
      return {
        platform,
        accountName: `${projectName} ${platform}`,
        handle: defaults.handle,
        enabled: current.enabled ?? defaults.enabled,
        length: current.length || defaults.length,
        cta: current.cta ?? defaults.cta,
        hashtags: current.hashtags ?? defaults.hashtags,
        notes: current.notes || defaults.notes,
      };
    });
}

function getDefaultMetricoolNetwork(platform) {
  return METRICOOL_NETWORK_BY_PLATFORM[platform] || "";
}

function normalizeAccount(accountInput = {}, projectName = "New Brand", index = 0) {
  const platform = platformOrder.includes(accountInput.platform) ? accountInput.platform : "Instagram";
  const defaults = createDefaultAccount(platform, projectName, index);
  const accountName = String(accountInput.accountName || "").trim() || defaults.accountName;
  const handle = String(accountInput.handle || "").trim() || defaults.handle;
  const metricoolNetwork = String(accountInput.metricoolNetwork || "").trim() || getDefaultMetricoolNetwork(platform);

  return {
    id: accountInput.id || randomUUID(),
    platform,
    accountName,
    handle,
    enabled: accountInput.enabled === undefined ? defaults.enabled : Boolean(accountInput.enabled),
    length: accountInput.length || defaults.length,
    cta: accountInput.cta === undefined ? defaults.cta : Boolean(accountInput.cta),
    hashtags: accountInput.hashtags === undefined ? defaults.hashtags : Boolean(accountInput.hashtags),
    notes: String(accountInput.notes || defaults.notes),
    metricoolPublishEnabled: accountInput.metricoolPublishEnabled === undefined ? false : Boolean(accountInput.metricoolPublishEnabled),
    metricoolNetwork,
  };
}

function normalizeAccounts(accounts = [], projectName = "New Brand") {
  const source = Array.isArray(accounts) ? accounts : [];
  return sortAccounts(source.map((account, index) => normalizeAccount(account, projectName, index)));
}

function upsertAccount(projectId, account) {
  const timestamp = nowIso();
  const existing = db.prepare("SELECT created_at FROM project_accounts WHERE id = ?").get(account.id);

  db.prepare(`
    INSERT INTO project_accounts (
      id, project_id, platform, account_name, handle, enabled, preferred_length, cta_enabled, hashtag_enabled, style_notes, metricool_publish_enabled, metricool_network, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      project_id = excluded.project_id,
      platform = excluded.platform,
      account_name = excluded.account_name,
      handle = excluded.handle,
      enabled = excluded.enabled,
      preferred_length = excluded.preferred_length,
      cta_enabled = excluded.cta_enabled,
      hashtag_enabled = excluded.hashtag_enabled,
      style_notes = excluded.style_notes,
      metricool_publish_enabled = excluded.metricool_publish_enabled,
      metricool_network = excluded.metricool_network,
      updated_at = excluded.updated_at
  `).run(
    account.id,
    projectId,
    account.platform,
    account.accountName,
    account.handle || "",
    account.enabled ? 1 : 0,
    account.length,
    account.cta ? 1 : 0,
    account.hashtags ? 1 : 0,
    account.notes || "",
    account.metricoolPublishEnabled ? 1 : 0,
    account.metricoolNetwork || getDefaultMetricoolNetwork(account.platform),
    existing?.created_at || timestamp,
    timestamp,
  );
}

function syncProjectAccounts(projectId, accounts) {
  const normalizedAccounts = normalizeAccounts(accounts);
  normalizedAccounts.forEach((account) => {
    upsertAccount(projectId, account);
  });

  const accountIds = normalizedAccounts.map((account) => account.id);
  if (accountIds.length) {
    const placeholders = accountIds.map(() => "?").join(", ");
    db.prepare(`DELETE FROM project_accounts WHERE project_id = ? AND id NOT IN (${placeholders})`).run(projectId, ...accountIds);
  } else {
    db.prepare("DELETE FROM project_accounts WHERE project_id = ?").run(projectId);
  }

  return normalizedAccounts;
}

function insertProject(projectInput, options = {}) {
  const projectId = options.preserveId ? projectInput.id : randomUUID();
  const timestamp = nowIso();
  const baseName = projectInput.name || "New Brand";
  const baseProject = createDefaultProjectData(baseName);
  const legacyAccounts = projectInput.platforms ? legacyPlatformsToAccounts(projectInput.platforms, baseName) : [];
  const accounts = normalizeAccounts(projectInput.accounts?.length ? projectInput.accounts : legacyAccounts.length ? legacyAccounts : baseProject.accounts, baseName);
  const project = {
    ...baseProject,
    ...projectInput,
    name: baseName,
    accounts,
    bannedPhrases: Array.isArray(projectInput.bannedPhrases) ? projectInput.bannedPhrases : [],
    metricoolBlogId: String(projectInput.metricoolBlogId || ""),
    metricoolBrandLabel: String(projectInput.metricoolBrandLabel || ""),
    metricoolBrandTimezone: String(projectInput.metricoolBrandTimezone || ""),
    metricoolBrandChannels: projectInput.metricoolBrandChannels || {},
    samples: Array.isArray(projectInput.samples) ? projectInput.samples : [],
  };

  db.prepare(`
    INSERT INTO projects (
      id, name, brand_summary, audience, tone, default_language, banned_phrases, metricool_blog_id, metricool_brand_label, metricool_brand_timezone, metricool_brand_channels_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    projectId,
    project.name,
    project.brandSummary,
    project.audience,
    project.tone,
    project.defaultLanguage,
    JSON.stringify(project.bannedPhrases),
    project.metricoolBlogId,
    project.metricoolBrandLabel,
    project.metricoolBrandTimezone,
    JSON.stringify(project.metricoolBrandChannels || {}),
    timestamp,
    timestamp,
  );

  project.accounts.forEach((account) => {
    upsertAccount(projectId, account);
  });

  const accountLookup = new Map(project.accounts.map((account) => [account.id, account]));
  project.samples.forEach((sample) => {
    const account = sample.accountId ? accountLookup.get(sample.accountId) : null;
    db.prepare(`
      INSERT INTO content_samples (
        id, project_id, source_platform, import_method, source_url, published_at, body, account_id, account_label, sample_type, review_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sample.id || randomUUID(),
      projectId,
      sample.platform || account?.platform || "X",
      sample.mode || "manual",
      sample.url || "",
      sample.publishedAt || timestamp,
      sample.body || "",
      account?.id || null,
      sample.accountLabel || getAccountLabel(account),
      normalizeSampleType(sample.sampleType || "general"),
      normalizeReviewStatus(sample.reviewStatus || "accepted"),
      timestamp,
      sample.updatedAt || timestamp,
    );
  });

  return projectId;
}

function cloneProject(projectId) {
  const project = getProjectView(projectId);
  if (!project) {
    throw httpError(404, "Project not found");
  }

  const accountIdMap = new Map(project.accounts.map((account) => [account.id, randomUUID()]));

  return insertProject(
    {
      ...project,
      id: randomUUID(),
      name: `${project.name} Copy`,
      metricoolBlogId: "",
      metricoolBrandLabel: "",
      metricoolBrandTimezone: "",
      metricoolBrandChannels: {},
      accounts: project.accounts.map((account) => ({
        ...account,
        id: accountIdMap.get(account.id),
        metricoolPublishEnabled: false,
      })),
      samples: project.samples.map((sample) => ({
        platform: sample.platform,
        accountId: sample.accountId ? accountIdMap.get(sample.accountId) : null,
        accountLabel: sample.accountLabel,
        mode: sample.mode,
        url: sample.url,
        body: sample.body,
        publishedAt: sample.publishedAt,
        sampleType: sample.sampleType,
        reviewStatus: sample.reviewStatus,
      })),
    },
    { preserveId: true },
  );
}

function updateProject(projectId, body = {}) {
  const existing = getProjectRow(projectId);
  if (!existing) {
    throw httpError(404, "Project not found");
  }

  const timestamp = nowIso();
  const bannedPhrases = Array.isArray(body.bannedPhrases) ? body.bannedPhrases : parseJsonArray(existing.banned_phrases);
  const projectName = body.name || existing.name;
  const currentAccounts = getProjectAccountRows(projectId).map(mapAccountRow);
  const accountsSource = Array.isArray(body.accounts) ? body.accounts : currentAccounts;

  db.prepare(`
    UPDATE projects
    SET name = ?, brand_summary = ?, audience = ?, tone = ?, default_language = ?, banned_phrases = ?, metricool_blog_id = ?, metricool_brand_label = ?, metricool_brand_timezone = ?, metricool_brand_channels_json = ?, updated_at = ?
    WHERE id = ?
  `).run(
    projectName,
    body.brandSummary || existing.brand_summary,
    body.audience || existing.audience,
    body.tone || existing.tone,
    body.defaultLanguage || existing.default_language,
    JSON.stringify(bannedPhrases),
    body.metricoolBlogId === undefined ? existing.metricool_blog_id : String(body.metricoolBlogId || ""),
    body.metricoolBrandLabel === undefined ? existing.metricool_brand_label : String(body.metricoolBrandLabel || ""),
    body.metricoolBrandTimezone === undefined ? existing.metricool_brand_timezone : String(body.metricoolBrandTimezone || ""),
    body.metricoolBrandChannels === undefined
      ? existing.metricool_brand_channels_json
      : JSON.stringify(body.metricoolBrandChannels || {}),
    timestamp,
    projectId,
  );

  syncProjectAccounts(projectId, normalizeAccounts(accountsSource, projectName));
}

function deleteProject(projectId) {
  const existing = getProjectRow(projectId);
  if (!existing) {
    throw httpError(404, "Project not found");
  }

  const generationIds = db
    .prepare("SELECT id FROM generation_runs WHERE project_id = ?")
    .all(projectId)
    .map((row) => row.id);

  generationIds.forEach((generationId) => {
    db.prepare("DELETE FROM generation_outputs WHERE generation_id = ?").run(generationId);
  });

  db.prepare("DELETE FROM publish_jobs WHERE project_id = ?").run(projectId);
  db.prepare("DELETE FROM assets WHERE project_id = ?").run(projectId);
  db.prepare("DELETE FROM content_samples WHERE project_id = ?").run(projectId);
  db.prepare("DELETE FROM project_accounts WHERE project_id = ?").run(projectId);
  db.prepare("DELETE FROM generation_runs WHERE project_id = ?").run(projectId);
  db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);

  rmSync(join(uploadRoot, projectId), { recursive: true, force: true });
}

function getProjectMetricoolState(row) {
  return {
    blogId: String(row?.metricool_blog_id || ""),
    brandLabel: String(row?.metricool_brand_label || ""),
    timezone: String(row?.metricool_brand_timezone || ""),
    channels: parseJsonObject(row?.metricool_brand_channels_json) || {},
  };
}

function getMetricoolChannelForAccount(metricoolState, account) {
  if (!metricoolState || !account?.platform) {
    return "";
  }

  return String(metricoolState.channels?.[account.platform] || "").trim();
}

function isPublicBaseUrlReachable(publicAppUrl) {
  return Boolean(publicAppUrl) && !/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(publicAppUrl);
}

function requiresMediaForPlatform(platform) {
  return ["Instagram", "TikTok", "YouTube"].includes(platform);
}

function formatMetricoolDateTime(isoValue, timezone) {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) {
    throw httpError(400, "Invalid publish date.");
  }

  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}T${lookup.hour}:${lookup.minute}:${lookup.second}`;
}

function derivePublishTitle(text, platform) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (!compact) {
    return platform === "YouTube" ? "New upload" : "";
  }

  const firstSentence = compact.split(/(?<=[.!?])\s+/)[0]?.trim() || compact;
  const maxLength = platform === "YouTube" ? 100 : 80;
  return firstSentence.length <= maxLength ? firstSentence : `${firstSentence.slice(0, maxLength - 1).trimEnd()}…`;
}

async function syncMetricoolBrands() {
  const brands = await listMetricoolBrands();
  return formatMetricoolBrands(brands);
}

function buildPublicAssetUrl(storagePath) {
  const { publicAppUrl } = getMetricoolConfig();
  if (!isPublicBaseUrlReachable(publicAppUrl)) {
    return "";
  }

  return `${publicAppUrl}/${String(storagePath || "").replace(/^\/+/, "")}`;
}

async function buildMetricoolMediaUrls(projectRow, generationId) {
  const assets = db
    .prepare(`
      SELECT * FROM assets
      WHERE project_id = ? AND generation_id = ?
      ORDER BY created_at ASC
    `)
    .all(projectRow.id, generationId);

  if (!assets.length) {
    return [];
  }

  const metricoolState = getProjectMetricoolState(projectRow);
  const publicUrls = assets
    .map((asset) => ({
      type: asset.asset_type,
      url: buildPublicAssetUrl(asset.storage_path),
    }))
    .filter((asset) => asset.url);

  if (!publicUrls.length) {
    return [];
  }

  const resolved = [];
  for (const asset of publicUrls) {
    if (asset.type === "image") {
      try {
        const normalized = await normalizeMetricoolImageUrl({
          blogId: metricoolState.blogId,
          assetUrl: asset.url,
        });
        resolved.push(String(normalized || asset.url).trim());
        continue;
      } catch {
        resolved.push(asset.url);
        continue;
      }
    }

    resolved.push(asset.url);
  }

  return resolved.filter(Boolean);
}

function buildMetricoolScheduledPostPayload({
  platform,
  providerNetwork,
  publishTitle,
  publishBody,
  scheduledFor,
  timezone,
  mediaUrls,
}) {
  const body = String(publishBody || "").trim();
  if (!body) {
    throw httpError(400, "Publish content is empty.");
  }

  const payload = {
    text: platform === "YouTube" ? body : body,
    providers: [
      {
        network: providerNetwork,
        status: "PENDING",
      },
    ],
    publicationDate: {
      dateTime: formatMetricoolDateTime(scheduledFor, timezone || "UTC"),
      timezone: timezone || "UTC",
    },
    autoPublish: true,
  };

  if (mediaUrls.length) {
    payload.media = mediaUrls;
  }

  if (platform === "YouTube") {
    payload.youtubeData = {
      title: String(publishTitle || derivePublishTitle(body, platform)).trim(),
      privacy: "PUBLIC",
    };
  }

  if (platform === "TikTok") {
    payload.tiktokData = {
      title: String(publishTitle || derivePublishTitle(body, platform)).trim(),
    };
  }

  return payload;
}

function validatePublishMode(mode, scheduledAt) {
  const normalizedMode = mode === "schedule" ? "schedule" : "now";
  if (normalizedMode === "schedule") {
    if (!scheduledAt) {
      throw httpError(400, "Choose a schedule date and time.");
    }

    const scheduledDate = new Date(scheduledAt);
    if (Number.isNaN(scheduledDate.getTime())) {
      throw httpError(400, "Invalid schedule date.");
    }

    return {
      mode: normalizedMode,
      scheduledFor: scheduledDate.toISOString(),
    };
  }

  return {
    mode: normalizedMode,
    scheduledFor: new Date().toISOString(),
  };
}

function getOutputRowForProject(projectId, outputId) {
  return db
    .prepare(`
      SELECT go.*, gr.project_id
      FROM generation_outputs go
      JOIN generation_runs gr ON gr.id = go.generation_id
      WHERE go.id = ?
    `)
    .get(outputId);
}

function insertPublishJobRow(projectId, input) {
  const timestamp = nowIso();
  const id = randomUUID();

  db.prepare(`
    INSERT INTO publish_jobs (
      id, project_id, output_id, generation_id, account_id, account_label, platform, provider_network, mode, scheduled_for,
      publish_title, publish_body, media_urls_json, metricool_blog_id, status, error_message, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    projectId,
    input.outputId,
    input.generationId,
    input.accountId,
    input.accountLabel,
    input.platform,
    input.providerNetwork,
    input.mode,
    input.scheduledFor,
    input.publishTitle || "",
    input.publishBody || "",
    JSON.stringify(input.mediaUrls || []),
    input.metricoolBlogId || "",
    input.status || "queued",
    input.errorMessage || "",
    timestamp,
    timestamp,
  );

  return id;
}

function updatePublishJob(jobId, updates = {}) {
  const existing = db.prepare("SELECT * FROM publish_jobs WHERE id = ?").get(jobId);
  if (!existing) {
    throw httpError(404, "Publish job not found.");
  }

  db.prepare(`
    UPDATE publish_jobs
    SET status = ?, error_message = ?, metricool_post_id = ?, metricool_post_uuid = ?, submitted_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    updates.status === undefined ? existing.status : updates.status,
    updates.errorMessage === undefined ? existing.error_message : updates.errorMessage,
    updates.metricoolPostId === undefined ? existing.metricool_post_id : updates.metricoolPostId,
    updates.metricoolPostUuid === undefined ? existing.metricool_post_uuid : updates.metricoolPostUuid,
    updates.submittedAt === undefined ? existing.submitted_at : updates.submittedAt,
    nowIso(),
    jobId,
  );
}

async function submitPublishJob(jobId, options = {}) {
  const job = db.prepare("SELECT * FROM publish_jobs WHERE id = ?").get(jobId);
  if (!job) {
    throw httpError(404, "Publish job not found.");
  }

  if (!["queued", "error"].includes(job.status)) {
    return job;
  }

  updatePublishJob(jobId, {
    status: "submitting",
    errorMessage: "",
  });

  try {
    const scheduledPost = buildMetricoolScheduledPostPayload({
      platform: job.platform,
      providerNetwork: job.provider_network,
      publishTitle: job.publish_title,
      publishBody: job.publish_body,
      scheduledFor: job.scheduled_for,
      timezone: getProjectMetricoolState(getProjectRow(job.project_id)).timezone || "UTC",
      mediaUrls: parseJsonArray(job.media_urls_json),
    });

    const response = await createMetricoolScheduledPost({
      blogId: job.metricool_blog_id,
      scheduledPost,
    });

    updatePublishJob(jobId, {
      status: "submitted",
      submittedAt: nowIso(),
      metricoolPostId: String(response?.id || ""),
      metricoolPostUuid: String(response?.uuid || ""),
    });

    return response;
  } catch (error) {
    updatePublishJob(jobId, {
      status: "error",
      errorMessage: error.message,
    });

    if (options.throwOnError) {
      throw error;
    }

    return null;
  }
}

async function dispatchDuePublishJobs() {
  if (publishLoopRunning) {
    return;
  }

  publishLoopRunning = true;
  try {
    const dueJobs = db
      .prepare(`
        SELECT * FROM publish_jobs
        WHERE status = 'queued' AND scheduled_for <= ?
        ORDER BY scheduled_for ASC
        LIMIT 8
      `)
      .all(nowIso());

    for (const job of dueJobs) {
      await submitPublishJob(job.id);
    }
  } finally {
    publishLoopRunning = false;
  }
}

function startPublishDispatcher() {
  const timer = setInterval(() => {
    dispatchDuePublishJobs().catch((error) => {
      console.error("Publish dispatcher error", error);
    });
  }, publishPollIntervalMs);

  timer.unref?.();
}

async function createPublishJob(projectId, body = {}) {
  const project = getProjectRow(projectId);
  if (!project) {
    throw httpError(404, "Project not found.");
  }

  const metricoolState = getProjectMetricoolState(project);
  if (!getMetricoolConfig().configured) {
    throw httpError(400, "Metricool is not configured. Add METRICOOL_API_TOKEN and METRICOOL_USER_ID first.");
  }

  if (!metricoolState.blogId) {
    throw httpError(400, "Select a Metricool brand for this project first.");
  }

  const output = getOutputRowForProject(projectId, body.outputId);
  if (!output || output.project_id !== projectId) {
    throw httpError(404, "Output not found.");
  }

  const account = getAccountForProject(projectId, body.accountId);
  if (!account) {
    throw httpError(400, "Choose a target account before publishing.");
  }

  if (!account.metricoolPublishEnabled) {
    throw httpError(400, "Enable Metricool publishing for this account in Account setup first.");
  }

  const providerNetwork = String(account.metricoolNetwork || getDefaultMetricoolNetwork(account.platform)).trim();
  if (!providerNetwork) {
    throw httpError(400, "This account is missing a Metricool network mapping.");
  }

  const connectedChannel = getMetricoolChannelForAccount(metricoolState, account);
  if (!connectedChannel) {
    throw httpError(400, `The selected Metricool brand does not have a connected ${account.platform} channel for this account.`);
  }

  const publishBody = String(body.publishBody || output.body || "").trim();
  const publishTitle = String(body.publishTitle || output.title || derivePublishTitle(publishBody, account.platform)).trim();
  const publishTiming = validatePublishMode(body.mode, body.scheduledAt);
  const mediaUrls = await buildMetricoolMediaUrls(project, output.generation_id);

  if (requiresMediaForPlatform(account.platform) && !mediaUrls.length) {
    throw httpError(
      400,
      "This channel needs publishable media. Configure PUBLIC_APP_URL to a public HTTPS domain so Metricool can fetch your uploaded assets.",
    );
  }

  const jobId = insertPublishJobRow(projectId, {
    outputId: output.id,
    generationId: output.generation_id,
    accountId: account.id,
    accountLabel: getAccountLabel(account),
    platform: account.platform,
    providerNetwork,
    mode: publishTiming.mode,
    scheduledFor: publishTiming.scheduledFor,
    publishTitle,
    publishBody,
    mediaUrls,
    metricoolBlogId: metricoolState.blogId,
    status: "queued",
  });

  if (publishTiming.mode === "now") {
    await submitPublishJob(jobId, { throwOnError: true });
  }

  db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(nowIso(), projectId);
}

function getAccountForProject(projectId, accountId) {
  if (!accountId) {
    return null;
  }

  const row = db
    .prepare(`
      SELECT * FROM project_accounts
      WHERE id = ? AND project_id = ?
    `)
    .get(accountId, projectId);

  return row ? mapAccountRow(row) : null;
}

function insertSampleRow(projectId, sampleInput = {}) {
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO content_samples (
      id, project_id, source_platform, import_method, source_url, published_at, body, account_id, account_label, sample_type, review_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    projectId,
    sampleInput.platform || "X",
    sampleInput.importMethod || "manual",
    sampleInput.url || "",
    sampleInput.publishedAt || timestamp,
    String(sampleInput.body || "").trim(),
    sampleInput.accountId || null,
    sampleInput.accountLabel || "",
    normalizeSampleType(sampleInput.sampleType || "general"),
    normalizeReviewStatus(sampleInput.reviewStatus || "accepted"),
    timestamp,
    timestamp,
  );
}

async function addSample(projectId, body = {}) {
  const project = getProjectRow(projectId);
  if (!project) {
    throw httpError(404, "Project not found");
  }

  const text = String(body.body || "").trim();
  const url = String(body.url || "").trim();
  const account = getAccountForProject(projectId, body.accountId);

  if (!text && !url) {
    throw httpError(400, "Add a link, sample text, or both.");
  }

  const platform = account?.platform || body.platform || "X";
  const accountId = account?.id || null;
  const accountLabel = getAccountLabel(account);
  const requestedSampleType = normalizeSampleType(body.sampleType || "general");
  const requestedReviewStatus = normalizeReviewStatus(body.reviewStatus || "accepted");

  if (text && requestedReviewStatus === "accepted" && !hasUsableSampleText(text)) {
    throw httpError(400, "Accepted samples need enough clean text to act as a real writing reference.");
  }

  if (text) {
    insertSampleRow(projectId, {
      platform,
      importMethod: url ? "manual+link" : "manual",
      url,
      body: text,
      accountId,
      accountLabel,
      sampleType: requestedSampleType,
      reviewStatus: requestedReviewStatus,
    });
  }

  if (url) {
    let importedSamples = [];

    try {
      importedSamples = await importSamplesFromUrl(url, { limit: 20 });
    } catch (error) {
      console.warn(`Sample import failed for ${url}`, error);
    }

    if (importedSamples.length) {
      importedSamples.forEach((sample) => {
        insertSampleRow(projectId, {
          platform,
          importMethod: "link-import",
          url,
          body: sample.body,
          publishedAt: sample.publishedAt,
          accountId,
          accountLabel,
          sampleType: requestedSampleType,
          reviewStatus: "pending",
        });
      });
    } else if (!text) {
      insertSampleRow(projectId, {
        platform,
        importMethod: "link",
        url,
        body: "",
        accountId,
        accountLabel,
        sampleType: requestedSampleType,
        reviewStatus: "pending",
      });
    }
  }

  db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(nowIso(), projectId);
}

function removeSample(projectId, sampleId) {
  const removed = db
    .prepare(`
      DELETE FROM content_samples
      WHERE id = ? AND project_id = ?
    `)
    .run(sampleId, projectId);

  if (!removed.changes) {
    throw httpError(404, "Sample not found.");
  }

  db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(nowIso(), projectId);
}

function updateSample(projectId, sampleId, input = {}) {
  const existing = db
    .prepare(`
      SELECT * FROM content_samples
      WHERE id = ? AND project_id = ?
    `)
    .get(sampleId, projectId);

  if (!existing) {
    throw httpError(404, "Sample not found.");
  }

  const nextBody = input.body === undefined ? existing.body : String(input.body || "").trim();
  const nextType = input.sampleType === undefined ? existing.sample_type : normalizeSampleType(input.sampleType);
  const nextStatus =
    input.reviewStatus === undefined ? existing.review_status : normalizeReviewStatus(input.reviewStatus);

  if (nextStatus === "accepted" && !hasUsableSampleText(nextBody)) {
    throw httpError(400, "Accepted samples need enough clean text to act as a real writing reference.");
  }

  db.prepare(`
    UPDATE content_samples
    SET body = ?, sample_type = ?, review_status = ?, updated_at = ?
    WHERE id = ? AND project_id = ?
  `).run(nextBody, nextType, nextStatus, nowIso(), sampleId, projectId);

  db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(nowIso(), projectId);
}

async function createGeneration(projectId, req) {
  const project = getProjectView(projectId);
  if (!project) {
    throw httpError(404, "Project not found");
  }

  if (!project.accounts?.length) {
    throw httpError(400, "Sync a Metricool brand with at least one supported channel before generating copy.");
  }

  const formData = await readFormData(req);
  const imageFiles = formData
    .getAll("images")
    .filter((item) => item instanceof File && item.size > 0);
  const videoFiles = formData
    .getAll("video")
    .filter((item) => item instanceof File && item.size > 0);

  if (imageFiles.length && videoFiles.length) {
    throw httpError(400, "Use either multiple images or one video per generation.");
  }

  if (videoFiles.length > 1) {
    throw httpError(400, "Only one video is allowed per generation.");
  }

  if (!imageFiles.length && !videoFiles.length) {
    throw httpError(400, "Upload at least one image set or one video before generating.");
  }

  const generationType = normalizeGenerationType(String(formData.get("generationType") || "general"));

  if (activeGenerations.has(projectId)) {
    throw httpError(409, "A generation is already running for this project.");
  }

  const generationId = randomUUID();
  const startedAt = nowIso();
  const abortController = new AbortController();
  activeGenerations.set(projectId, {
    generationId,
    abortController,
  });

  db.prepare(`
    INSERT INTO generation_runs (
      id, project_id, title, asset_mode, asset_summary, asset_insights_json, sample_count, status, provider, cancel_requested, generation_type, created_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    generationId,
    projectId,
    `${formatGenerationTypeLabel(generationType)} draft for ${project.name}`,
    "pending",
    "Collecting uploaded assets",
    "{}",
    0,
    "running",
    "",
    0,
    generationType,
    startedAt,
    null,
  );

  const storedAssets = [];

  try {
    for (const image of imageFiles) {
      throwIfGenerationCancelled(abortController.signal);
      storedAssets.push(await storeAsset(projectId, generationId, image, "image"));
    }

    if (videoFiles[0]) {
      throwIfGenerationCancelled(abortController.signal);
      storedAssets.push(await storeAsset(projectId, generationId, videoFiles[0], "video"));
    }

    throwIfGenerationCancelled(abortController.signal);
    const relevantSamples = getRelevantSamples(projectId, generationType, 24);
    const trendContext =
      generationType === "trending"
        ? await researchTrendingContext({
            samples: relevantSamples,
            assets: storedAssets,
            signal: abortController.signal,
          })
        : null;

    if (generationType === "trending" && !trendContext) {
      throw httpError(
        400,
        "Could not confirm a live trend from current public search results. Try another asset or switch to General mode.",
      );
    }

    await maybeDelayGeneration(abortController.signal);
    const draftPackage = await generateDraftPackage({
      project,
      samples: relevantSamples,
      assets: storedAssets,
      uploadsRoot: uploadRoot,
      generationType,
      trendContext,
      signal: abortController.signal,
    });
    throwIfGenerationCancelled(abortController.signal);

    const timestamp = nowIso();
    db.prepare(`
      UPDATE generation_runs
      SET title = ?, asset_mode = ?, asset_summary = ?, asset_insights_json = ?, sample_count = ?, status = ?, provider = ?, cancel_requested = 0, generation_type = ?, completed_at = ?
      WHERE id = ?
    `).run(
      draftPackage.title,
      draftPackage.assetMode,
      draftPackage.assetSummary,
      JSON.stringify(draftPackage.assetInsights || {}),
      draftPackage.sampleCount,
      "completed",
      draftPackage.provider || "fallback",
      draftPackage.generationType || generationType,
      timestamp,
      generationId,
    );

    const preferredScopes = new Set();

    draftPackage.outputs.forEach((output, index) => {
      const scopeKey = getOutputPreferenceScope(output);
      const isPreferred = preferredScopes.has(scopeKey) ? 0 : 1;
      preferredScopes.add(scopeKey);

      db.prepare(`
        INSERT INTO generation_outputs (
          id, generation_id, platform, account_id, account_label, candidate_index, title, body, is_preferred, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        generationId,
        output.platform,
        output.accountId || null,
        output.accountLabel || "",
        output.candidateIndex ?? index,
        output.title || null,
        output.body || null,
        isPreferred,
        timestamp,
      );
    });

    db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(timestamp, projectId);
  } catch (error) {
    const cancelled = isAbortError(error) || abortController.signal.aborted;
    db.prepare(`
      UPDATE generation_runs
      SET status = ?, asset_mode = ?, asset_summary = ?, provider = ?, cancel_requested = ?, generation_type = ?, completed_at = ?
      WHERE id = ?
    `).run(
      cancelled ? "cancelled" : "failed",
      videoFiles[0] ? "single_video" : imageFiles.length ? "multi_image" : "none",
      cancelled ? "Generation cancelled by user." : error.message || "Generation failed",
      "",
      cancelled ? 1 : 0,
      generationType,
      nowIso(),
      generationId,
    );
    if (cancelled) {
      throw httpError(499, "Generation cancelled.");
    }
    throw error;
  } finally {
    activeGenerations.delete(projectId);
  }
}

async function storeAsset(projectId, generationId, file, assetType) {
  const projectUploadDir = join(uploadRoot, projectId);
  mkdirSync(projectUploadDir, { recursive: true });

  const safeFileName = sanitizeFileName(file.name);
  const relativePath = join(projectId, `${Date.now()}-${safeFileName}`);
  const absolutePath = join(uploadRoot, relativePath);
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  writeFileSync(absolutePath, fileBuffer);

  const timestamp = nowIso();
  const assetId = randomUUID();
  const processedAsset = await processStoredAsset({
    asset: {
      id: assetId,
      assetType,
      fileName: safeFileName,
      storagePath: relativePath,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size || fileBuffer.byteLength,
    },
    absolutePath,
    uploadsRoot: uploadRoot,
    projectId,
  });

  db.prepare(`
    INSERT INTO assets (
      id, project_id, generation_id, asset_type, file_name, storage_path, mime_type, size_bytes, extracted_summary, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    assetId,
    projectId,
    generationId,
    assetType,
    safeFileName,
    relativePath,
    file.type || "application/octet-stream",
    file.size || fileBuffer.byteLength,
    processedAsset.extractedSummary || "",
    timestamp,
  );

  return processedAsset;
}

function getRelevantSamples(projectId, generationType = "general", limit = 24) {
  return db
    .prepare(`
      SELECT * FROM content_samples
      WHERE project_id = ?
      ORDER BY COALESCE(published_at, created_at) DESC, created_at DESC
    `)
    .all(projectId)
    .map((sample) => mapSampleRow(sample))
    .filter((sample) => sample.reviewStatus === "accepted")
    .filter((sample) => hasUsableSampleText(sample.body))
    .sort((left, right) => {
      const leftType = left.sampleType === generationType ? 1 : left.sampleType === "general" ? 2 : 3;
      const rightType = right.sampleType === generationType ? 1 : right.sampleType === "general" ? 2 : 3;
      if (leftType !== rightType) {
        return leftType - rightType;
      }

      const leftTime = new Date(left.publishedAt || left.createdAt || 0).getTime();
      const rightTime = new Date(right.publishedAt || right.createdAt || 0).getTime();
      return rightTime - leftTime;
    })
    .slice(0, limit);
}

function updateGenerationOutput(projectId, outputId, input = {}) {
  const output = db
    .prepare(`
      SELECT go.*, gr.project_id
      FROM generation_outputs go
      JOIN generation_runs gr ON gr.id = go.generation_id
      WHERE go.id = ?
    `)
    .get(outputId);

  if (!output || output.project_id !== projectId) {
    throw httpError(404, "Output not found.");
  }

  const nextTitle = normalizeOutputValue(input.title, output.title);
  const nextBody = normalizeOutputValue(input.body, output.body);

  db.prepare(`
    UPDATE generation_outputs
    SET title = ?, body = ?
    WHERE id = ?
  `).run(nextTitle, nextBody, outputId);

  if (input.isPreferred === true) {
    clearPreferredOutputsForScope(output);
    db.prepare("UPDATE generation_outputs SET is_preferred = 1 WHERE id = ?").run(outputId);
  } else if (input.isPreferred === false) {
    db.prepare("UPDATE generation_outputs SET is_preferred = 0 WHERE id = ?").run(outputId);
  }

  db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(nowIso(), projectId);
}

function normalizeOutputValue(candidate, fallbackValue) {
  if (candidate === undefined) {
    return fallbackValue ?? null;
  }

  const value = String(candidate ?? "").trim();
  return value || null;
}

function clearPreferredOutputsForScope(output) {
  if (output.platform === "general") {
    db.prepare(`
      UPDATE generation_outputs
      SET is_preferred = 0
      WHERE generation_id = ? AND platform = 'general'
    `).run(output.generation_id);
    return;
  }

  if (output.account_id) {
    db.prepare(`
      UPDATE generation_outputs
      SET is_preferred = 0
      WHERE generation_id = ? AND account_id = ?
    `).run(output.generation_id, output.account_id);
    return;
  }

  db.prepare(`
    UPDATE generation_outputs
    SET is_preferred = 0
    WHERE generation_id = ? AND platform = ? AND account_id IS NULL
  `).run(output.generation_id, output.platform);
}

function getProjectView(projectId) {
  const row = getProjectRow(projectId);
  return row ? buildProjectView(row) : null;
}

function listProjects() {
  return db
    .prepare("SELECT * FROM projects ORDER BY updated_at DESC, created_at DESC")
    .all()
    .map((row) => buildProjectView(row));
}

function mapSampleRow(sample) {
  const body = sample.body;
  return {
    id: sample.id,
    platform: sample.source_platform,
    accountId: sample.account_id || null,
    accountLabel: sample.account_label || "",
    mode: sample.import_method,
    url: sample.source_url,
    body,
    publishedAt: sample.published_at,
    createdAt: sample.created_at,
    updatedAt: sample.updated_at || sample.created_at,
    sampleType: normalizeSampleType(sample.sample_type || "general"),
    reviewStatus: normalizeReviewStatus(sample.review_status || "accepted"),
    isUsable: hasUsableSampleText(body),
  };
}

function mapAccountRow(row) {
  return {
    id: row.id,
    platform: row.platform,
    accountName: row.account_name,
    handle: row.handle,
    enabled: Boolean(row.enabled),
    length: row.preferred_length || "medium",
    cta: Boolean(row.cta_enabled),
    hashtags: Boolean(row.hashtag_enabled),
    notes: row.style_notes || "",
    metricoolPublishEnabled: Boolean(row.metricool_publish_enabled),
    metricoolNetwork: row.metricool_network || getDefaultMetricoolNetwork(row.platform),
  };
}

function mapPublishJobRow(job) {
  return {
    id: job.id,
    outputId: job.output_id,
    accountId: job.account_id,
    accountLabel: job.account_label,
    platform: job.platform,
    providerNetwork: job.provider_network,
    mode: job.mode,
    scheduledFor: job.scheduled_for,
    status: job.status,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    submittedAt: job.submitted_at || null,
    publishTitle: job.publish_title || "",
    publishBody: job.publish_body || "",
    metricoolBlogId: job.metricool_blog_id || "",
    metricoolPostId: job.metricool_post_id || "",
    metricoolPostUuid: job.metricool_post_uuid || "",
    errorMessage: job.error_message || "",
  };
}

function buildProjectView(row) {
  const accounts = sortAccounts(getProjectAccountRows(row.id).map(mapAccountRow));

  const samples = db
    .prepare(`
      SELECT * FROM content_samples
      WHERE project_id = ?
      ORDER BY COALESCE(published_at, created_at) DESC, created_at DESC
    `)
    .all(row.id)
    .map((sample) => mapSampleRow(sample));

  const historyRuns = db
    .prepare(`
      SELECT * FROM generation_runs
      WHERE project_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `)
    .all(row.id);

  const history = historyRuns.map((run) => {
    const resolvedProvider = resolveRunProvider(run);

    return {
      id: run.id,
      title: run.title,
      createdAt: formatHistoryDate(run.created_at),
      status: run.status,
      provider: formatProviderLabel(resolvedProvider),
      generationType: formatGenerationTypeLabel(run.generation_type || "general"),
    };
  });

  const latestCompletedRun = historyRuns.find((run) => run.status === "completed") || null;
  const latestOutputs = latestCompletedRun
    ? db
        .prepare(`
          SELECT * FROM generation_outputs
          WHERE generation_id = ?
          ORDER BY platform, account_label, candidate_index
        `)
        .all(latestCompletedRun.id)
    : [];

  const publishJobs = db
    .prepare(`
      SELECT * FROM publish_jobs
      WHERE project_id = ?
      ORDER BY created_at DESC
      LIMIT 12
    `)
    .all(row.id)
    .map((job) => mapPublishJobRow(job));

  return {
    id: row.id,
    name: row.name,
    brandSummary: row.brand_summary,
    audience: row.audience,
    tone: row.tone,
    defaultLanguage: row.default_language,
    bannedPhrases: parseJsonArray(row.banned_phrases),
    metricool: {
      configured: getMetricoolConfig().configured,
      blogId: row.metricool_blog_id || "",
      brandLabel: row.metricool_brand_label || "",
      timezone: row.metricool_brand_timezone || "",
      channels: parseJsonObject(row.metricool_brand_channels_json) || {},
    },
    accounts,
    samples,
    history,
    publishJobs,
    latestAssetInsights: latestCompletedRun ? parseJsonObject(latestCompletedRun.asset_insights_json) : null,
    draftOutputs: buildDraftOutputs(latestCompletedRun, latestOutputs),
  };
}

function formatTargetLabel(platform, accountLabel) {
  if (!platform) {
    return "";
  }

  if (!accountLabel) {
    return platform;
  }

  return `${platform} / ${accountLabel}`;
}

function draftPlatformSortValue(platform = "") {
  if (platform === "general") {
    return platformOrder.length + 1;
  }

  const index = platformOrder.indexOf(platform);
  return index === -1 ? platformOrder.length + 2 : index;
}

function buildDraftOutputs(latestRun, outputs) {
  const providerLabel = latestRun ? formatProviderLabel(resolveRunProvider(latestRun)) : "";
  const entries = latestRun
    ? Array.from(
        outputs
          .slice()
          .sort((left, right) => {
            if (Number(right.is_preferred || 0) !== Number(left.is_preferred || 0)) {
              return Number(right.is_preferred || 0) - Number(left.is_preferred || 0);
            }

            const platformDelta = draftPlatformSortValue(left.platform) - draftPlatformSortValue(right.platform);
            if (platformDelta !== 0) {
              return platformDelta;
            }

            return `${left.account_label || ""} ${left.candidate_index || 0}`.localeCompare(
              `${right.account_label || ""} ${right.candidate_index || 0}`,
            );
          })
          .reduce((map, output) => {
            const uiPlatform = dbToUiPlatform[output.platform] || output.platform;
            const scopeKey = uiPlatform === "general"
              ? "general"
              : `${uiPlatform}:${output.account_id || output.account_label || ""}`;

            if (!map.has(scopeKey)) {
              map.set(scopeKey, { output, uiPlatform });
            }

            return map;
          }, new Map())
          .values(),
      ).map(({ output, uiPlatform }) =>
        buildOutputEntry({
          output,
          label:
            uiPlatform === "general"
              ? "General draft"
              : formatTargetLabel(uiPlatform, output.account_label || ""),
          platform: uiPlatform,
          accountId: output.account_id || null,
          accountLabel: output.account_label || "",
          fields:
            uiPlatform === "YouTube"
              ? [
                  {
                    key: "title",
                    label: "Title",
                    value: output.title || "",
                    placeholder: "No title yet.",
                    multiline: false,
                  },
                  {
                    key: "body",
                    label: "Description",
                    value: output.body || "",
                    placeholder: "No description yet.",
                    multiline: true,
                  },
                ]
              : [
                  {
                    key: "body",
                    label: uiPlatform === "X" ? "Post" : "Caption",
                    value: output.body || "",
                    placeholder: "No output yet.",
                    multiline: true,
                  },
                ],
        }),
      )
    : [];

  return {
    heading: latestRun ? `${formatGenerationTypeLabel(latestRun.generation_type || "general")} outputs` : "Generated outputs",
    meta: latestRun
      ? [
          ...(providerLabel ? [`Provider: ${providerLabel}`] : []),
          `Type: ${formatGenerationTypeLabel(latestRun.generation_type || "general")}`,
          `${latestRun.sample_count} sample${latestRun.sample_count === 1 ? "" : "s"} referenced`,
          latestRun.asset_summary,
        ]
      : [],
    entries,
  };
}

function buildOutputEntry({ output, label, platform, accountId, accountLabel, fields }) {
  return {
    id: output?.id || null,
    label,
    platform: platform || output?.platform || "general",
    accountId: accountId || output?.account_id || null,
    accountLabel: accountLabel || output?.account_label || "",
    isPreferred: Boolean(output?.is_preferred),
    fields,
  };
}

function getOutputPreferenceScope(output) {
  if (output.platform === "general") {
    return "general";
  }

  if (output.accountId) {
    return `account:${output.accountId}`;
  }

  return `platform:${output.platform}`;
}

function hasUsableSampleText(value) {
  return isUsableSampleText(value);
}

function isAbortError(error) {
  return error?.name === "AbortError" || error?.name === "TimeoutError" || /cancelled/i.test(String(error?.message || ""));
}

function throwIfGenerationCancelled(signal) {
  if (signal?.aborted) {
    const error = new Error("Generation cancelled.");
    error.name = "AbortError";
    throw error;
  }
}

function cancelActiveGeneration(projectId) {
  const active = activeGenerations.get(projectId);
  if (!active) {
    return false;
  }

  db.prepare(`
    UPDATE generation_runs
    SET status = ?, asset_summary = ?, cancel_requested = 1, completed_at = ?
    WHERE id = ?
  `).run("cancelled", "Generation cancelled by user.", nowIso(), active.generationId);

  active.abortController.abort();
  return true;
}

async function maybeDelayGeneration(signal) {
  const delayMs = Math.max(0, Number(process.env.GENERATION_DEBUG_DELAY_MS || 0));
  if (!delayMs) {
    return;
  }

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);

    const onAbort = () => {
      cleanup();
      const error = new Error("Generation cancelled.");
      error.name = "AbortError";
      reject(error);
    };

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function formatProviderLabel(provider) {
  if (provider === "gateway") {
    return "Leihuo Gateway";
  }

  if (provider === "openai") {
    return "OpenAI-compatible";
  }

  if (provider === "fallback" || provider === "mock") {
    return "Local fallback";
  }

  return "";
}

function resolveRunProvider(run) {
  if (!run) {
    return "";
  }

  if (run.provider) {
    return run.provider;
  }

  if (/fallback reason:/i.test(run.asset_summary || "")) {
    return "fallback";
  }

  if (run.status === "completed" && getGeneratorMode() === "mock") {
    return "fallback";
  }

  if (run.status === "completed" && getGeneratorMode() === "openai") {
    return "openai";
  }

  if (run.status === "completed" && getGeneratorMode() === "gateway") {
    return "gateway";
  }

  return "";
}

function platformSortValue(platform) {
  const order = ["General", ...platformOrder];
  return Math.max(order.indexOf(platform), 0);
}

function formatHistoryDate(value) {
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
