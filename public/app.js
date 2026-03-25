const state = {
  projects: [],
  activeProjectId: "",
  generatorMode: "mock",
  isGenerating: false,
  isCancellingGeneration: false,
  generationAbortController: null,
  selectedAssets: {
    images: [],
    video: null,
  },
  generationType: "general",
  historyExpanded: {},
  sampleLibraryExpanded: {},
  sampleExpanded: {},
  metricoolBrands: [],
};

const elements = {
  projectSelect: document.querySelector("#projectSelect"),
  projectName: document.querySelector("#projectName"),
  brandNameInput: document.querySelector("#brandNameInput"),
  metricoolStatus: document.querySelector("#metricoolStatus"),
  metricoolBrandSelect: document.querySelector("#metricoolBrandSelect"),
  metricoolChannelHint: document.querySelector("#metricoolChannelHint"),
  syncMetricoolBrandsButton: document.querySelector("#syncMetricoolBrandsButton"),
  accountGrid: document.querySelector("#accountGrid"),
  sampleLinkInput: document.querySelector("#sampleLinkInput"),
  sampleAccountInput: document.querySelector("#sampleAccountInput"),
  sampleTypeInput: document.querySelector("#sampleTypeInput"),
  sampleList: document.querySelector("#sampleList"),
  sampleToggleButton: document.querySelector("#sampleToggleButton"),
  imageUploadInput: document.querySelector("#imageUploadInput"),
  videoUploadInput: document.querySelector("#videoUploadInput"),
  assetSummary: document.querySelector("#assetSummary"),
  assetInsightsPanel: document.querySelector("#assetInsightsPanel"),
  generationTypeList: document.querySelector("#generationTypeList"),
  generateButton: document.querySelector("#generateButton"),
  stopGenerateButton: document.querySelector("#stopGenerateButton"),
  outputPanel: document.querySelector("#outputPanel"),
  historyList: document.querySelector("#historyList"),
  historyToggleButton: document.querySelector("#historyToggleButton"),
  publishJobsList: document.querySelector("#publishJobsList"),
  generationModeHint: document.querySelector("#generationModeHint"),
  newProjectButton: document.querySelector("#newProjectButton"),
  duplicateProjectButton: document.querySelector("#duplicateProjectButton"),
  saveProjectButton: document.querySelector("#saveProjectButton"),
  addSampleButton: document.querySelector("#addSampleButton"),
};

const platformMarks = {
  General: "AI",
  X: "X",
  Instagram: "IG",
  TikTok: "TT",
  YouTube: "YT",
};

const metricoolNetworkByPlatform = {
  X: "twitter",
  Instagram: "instagram",
  TikTok: "tiktok",
  YouTube: "youtube",
};

const generationModes = [
  {
    id: "update",
    title: "Update",
    description: "For patch notes, event refreshes, rewards, or date-heavy announcements. Must carry forward confirmed details from the assets.",
  },
  {
    id: "trending",
    title: "Trending",
    description: "For social hot-topic tie-ins. The app confirms a live trend online first, then merges that angle with the game-side material.",
  },
  {
    id: "general",
    title: "General",
    description: "For everything else. Uses asset extraction and recent post library patterns without assuming a specific format.",
  },
];

const defaultAccountSettings = {
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getSafeExternalUrl(value) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

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

function createLocalAccount(projectName = "New Brand", platform = "Instagram", index = 0) {
  const defaults = defaultAccountSettings[platform] || defaultAccountSettings.Instagram;
  return {
    id: crypto.randomUUID(),
    platform,
    accountName: `${projectName} ${platform}${index > 0 ? ` ${index + 1}` : ""}`,
    handle: `@${slugify(projectName)}-${platformSuffix(platform)}${index > 0 ? `-${index + 1}` : ""}`,
    enabled: defaults.enabled,
    length: defaults.length,
    cta: defaults.cta,
    hashtags: defaults.hashtags,
    notes: defaults.notes,
    metricoolPublishEnabled: false,
    metricoolNetwork: metricoolNetworkByPlatform[platform] || "",
  };
}

function formatMetricoolChannelHandle(platform, value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  if (platform === "YouTube") {
    return text;
  }

  return text.startsWith("@") ? text : `@${text}`;
}

function buildAccountsFromMetricoolBrand(project, brand) {
  if (!brand) {
    return [];
  }

  const existingByPlatform = new Map((project?.accounts || []).map((account) => [account.platform, account]));
  const channels = brand.channels || {};

  return ["X", "Instagram", "TikTok", "YouTube"]
    .filter((platform) => String(channels[platform] || "").trim())
    .map((platform, index) => {
      const existing = existingByPlatform.get(platform);
      const defaults = defaultAccountSettings[platform] || defaultAccountSettings.Instagram;
      const channelValue = String(channels[platform] || "").trim();
      return {
        id: existing?.id || crypto.randomUUID(),
        platform,
        accountName: channelValue,
        handle: formatMetricoolChannelHandle(platform, channelValue),
        enabled: true,
        length: existing?.length || defaults.length,
        cta: existing?.cta ?? defaults.cta,
        hashtags: existing?.hashtags ?? defaults.hashtags,
        notes: existing?.notes || defaults.notes,
        metricoolPublishEnabled: existing?.metricoolPublishEnabled ?? true,
        metricoolNetwork: existing?.metricoolNetwork || getDefaultMetricoolNetwork(platform),
        order: index,
      };
    });
}

function getActiveProject() {
  return state.projects.find((project) => project.id === state.activeProjectId) || null;
}

function getAccountLabelText(account) {
  return account?.handle || account?.accountName || `${account?.platform || "Account"} account`;
}

function formatSampleMode(mode) {
  if (mode === "link-import") {
    return "link import";
  }

  if (mode === "manual+link") {
    return "manual + link";
  }

  return String(mode || "manual").replaceAll("-", " ");
}

function formatReviewStatus(status) {
  if (status === "accepted") {
    return "accepted";
  }

  if (status === "rejected") {
    return "rejected";
  }

  return "pending review";
}

function buildPlatformLabel(name) {
  const wrapper = document.createElement("span");
  wrapper.className = "platform-label";

  const icon = document.createElement("span");
  icon.className = "platform-icon";
  icon.dataset.platform = name;
  icon.textContent = platformMarks[name] || name.slice(0, 2).toUpperCase();

  const text = document.createElement("span");
  text.textContent = name;

  wrapper.append(icon, text);
  return wrapper;
}

function buildAccountLabel(account) {
  const wrapper = document.createElement("span");
  wrapper.className = "account-label";

  const icon = document.createElement("span");
  icon.className = "platform-icon";
  icon.dataset.platform = account.platform;
  icon.textContent = platformMarks[account.platform] || account.platform.slice(0, 2).toUpperCase();

  const textWrap = document.createElement("span");
  textWrap.className = "account-copy";

  const title = document.createElement("span");
  title.className = "account-title";
  title.textContent = getAccountLabelText(account);

  const subtitle = document.createElement("span");
  subtitle.className = "account-subtitle";
  subtitle.textContent = account.accountName && account.accountName !== getAccountLabelText(account)
    ? `${account.platform} • ${account.accountName}`
    : account.platform;

  textWrap.append(title, subtitle);
  wrapper.append(icon, textWrap);
  return wrapper;
}

function formatDate(rawValue) {
  if (!rawValue) {
    return "No date";
  }

  const date = new Date(rawValue);
  if (Number.isNaN(date.getTime())) {
    return rawValue;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(rawValue) {
  if (!rawValue) {
    return "No time";
  }

  const date = new Date(rawValue);
  if (Number.isNaN(date.getTime())) {
    return rawValue;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toDateTimeLocalValue(rawValue) {
  const date = rawValue ? new Date(rawValue) : new Date(Date.now() + 60 * 60 * 1000);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function getEnabledAccounts(project) {
  return project ? project.accounts.filter((account) => account.enabled) : [];
}

function getDefaultMetricoolNetwork(platform) {
  return metricoolNetworkByPlatform[platform] || "";
}

function normalizeComparableLabel(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/^https?:\/\/(?:www\.)?/i, "")
    .replace(/^x\.com\//i, "")
    .replace(/^instagram\.com\//i, "")
    .replace(/^tiktok\.com\/@?/i, "")
    .replace(/^youtube\.com\/(?:@|channel\/|c\/)?/i, "")
    .replace(/[^a-z0-9]+/g, "");
}

function getMetricoolChannelLabel(project, account) {
  if (!project || !account) {
    return "";
  }

  return String(project.metricool?.channels?.[account.platform] || "").trim();
}

function doesAccountMatchMetricoolChannel(account, channelLabel) {
  const connected = normalizeComparableLabel(channelLabel);
  if (!connected) {
    return false;
  }

  if (/^uc[a-z0-9]{10,}$/i.test(String(channelLabel || "").trim())) {
    return true;
  }

  const handle = normalizeComparableLabel(account?.handle);
  const accountName = normalizeComparableLabel(account?.accountName);
  return Boolean(handle && (handle.includes(connected) || connected.includes(handle)))
    || Boolean(accountName && (accountName.includes(connected) || connected.includes(accountName)));
}

function getMetricoolRouting(project, account) {
  const configured = Boolean(project?.metricool?.configured);
  const blogId = String(project?.metricool?.blogId || "").trim();
  const connectedChannel = getMetricoolChannelLabel(project, account);
  const publishEnabled = Boolean(account?.metricoolPublishEnabled);
  const network = String(account?.metricoolNetwork || getDefaultMetricoolNetwork(account?.platform)).trim();
  const looksMatched = doesAccountMatchMetricoolChannel(account, connectedChannel);

  if (!configured) {
    return {
      eligible: false,
      connectedChannel,
      network,
      tone: "muted",
      summary: "Metricool is not configured on the server yet.",
      warning: "",
    };
  }

  if (!blogId) {
    return {
      eligible: false,
      connectedChannel,
      network,
      tone: "muted",
      summary: "Link a Metricool brand to this project first.",
      warning: "",
    };
  }

  if (!publishEnabled) {
    return {
      eligible: false,
      connectedChannel,
      network,
      tone: "muted",
      summary: connectedChannel
        ? `This account will stay out of publishing. Connected ${account.platform} channel: ${connectedChannel}`
        : `No ${account.platform} channel is connected in the selected Metricool brand yet.`,
      warning: "",
    };
  }

  if (!connectedChannel) {
    return {
      eligible: false,
      connectedChannel,
      network,
      tone: "warning",
      summary: `Publishing is enabled, but this Metricool brand has no connected ${account.platform} channel.`,
      warning: "",
    };
  }

  if (!account?.enabled) {
    return {
      eligible: false,
      connectedChannel,
      network,
      tone: "muted",
      summary: `This account is mapped to ${connectedChannel}, but the account is currently disabled.`,
      warning: "",
    };
  }

  return {
    eligible: true,
    connectedChannel,
    network,
    tone: looksMatched ? "success" : "warning",
    summary: `Routes to Metricool ${account.platform} channel: ${connectedChannel}`,
    warning: looksMatched
      ? ""
      : "The local handle does not obviously match the connected Metricool channel. Publishing will still go to the connected channel above.",
  };
}

function getPublishableAccounts(project) {
  return getEnabledAccounts(project).filter((account) => getMetricoolRouting(project, account).eligible);
}

function formatFileSize(sizeBytes = 0) {
  if (!sizeBytes) {
    return "";
  }

  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
}

function hasSelectedAssets() {
  return state.selectedAssets.images.length > 0 || Boolean(state.selectedAssets.video);
}

function getHistoryExpanded(projectId) {
  return Boolean(state.historyExpanded[projectId]);
}

function setHistoryExpanded(projectId, expanded) {
  if (!projectId) {
    return;
  }

  state.historyExpanded = {
    ...state.historyExpanded,
    [projectId]: expanded,
  };
}

function getSampleLibraryExpanded(projectId) {
  return Boolean(state.sampleLibraryExpanded[projectId]);
}

function setSampleLibraryExpanded(projectId, expanded) {
  if (!projectId) {
    return;
  }

  state.sampleLibraryExpanded = {
    ...state.sampleLibraryExpanded,
    [projectId]: expanded,
  };
}

function getSampleExpanded(sampleId) {
  return Boolean(state.sampleExpanded[sampleId]);
}

function setSampleExpanded(sampleId, expanded) {
  if (!sampleId) {
    return;
  }

  state.sampleExpanded = {
    ...state.sampleExpanded,
    [sampleId]: expanded,
  };
}

function isSampleCollapsible(sample, body) {
  return Boolean(body && sample.reviewStatus === "accepted" && sample.isUsable);
}

function buildSamplePreview(body) {
  const compact = String(body || "").replace(/\s+/g, " ").trim();
  if (compact.length <= 180) {
    return compact;
  }

  return `${compact.slice(0, 177).trimEnd()}...`;
}

async function apiRequest(path, options = {}) {
  const config = {
    method: options.method || "GET",
    headers: {},
    signal: options.signal,
  };

  if (options.json) {
    config.headers["content-type"] = "application/json";
    config.body = JSON.stringify(options.json);
  }

  if (options.formData) {
    config.body = options.formData;
  }

  let response;

  try {
    response = await fetch(path, config);
  } catch (error) {
    if (error?.name === "AbortError") {
      const abortError = new Error("Request cancelled");
      abortError.name = "AbortError";
      throw abortError;
    }

    throw error;
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }

  return payload;
}

function applyPayload(payload) {
  if (Array.isArray(payload.projects)) {
    state.projects = payload.projects;
  }

  if (payload.generatorMode) {
    state.generatorMode = payload.generatorMode;
  }
  if (Array.isArray(payload.brands)) {
    state.metricoolBrands = payload.brands;
    state.projects = state.projects.map((project) => {
      const linkedBrand = state.metricoolBrands.find((brand) => brand.blogId === project.metricool?.blogId);
      if (!linkedBrand) {
        return project;
      }

      const nextProject = {
        ...project,
        accounts: [...(project.accounts || [])],
      };
      applySelectedMetricoolBrand(nextProject, linkedBrand);
      return nextProject;
    });
  }

  if (Array.isArray(payload.projects) || payload.activeProjectId) {
    const candidateId = payload.activeProjectId || state.activeProjectId;
    state.activeProjectId = state.projects.some((project) => project.id === candidateId)
      ? candidateId
      : state.projects[0]?.id || "";
  }

  render();
}

async function loadProjects(preferredProjectId = state.activeProjectId) {
  const query = preferredProjectId ? `?activeProjectId=${encodeURIComponent(preferredProjectId)}` : "";
  const payload = await apiRequest(`/api/projects${query}`);
  applyPayload(payload);
}

function renderProjectSelect() {
  elements.projectSelect.textContent = "";

  if (!state.projects.length) {
    const option = document.createElement("option");
    option.textContent = "Loading projects...";
    elements.projectSelect.appendChild(option);
    elements.projectSelect.disabled = true;
    return;
  }

  elements.projectSelect.disabled = false;
  state.projects.forEach((project) => {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = `${project.name} (${getEnabledAccounts(project).length} accounts)`;
    elements.projectSelect.appendChild(option);
  });

  elements.projectSelect.value = state.activeProjectId;
}

function populateProjectFields(project) {
  if (!project) {
    elements.projectName.textContent = "No project";
    elements.brandNameInput.value = "";
    elements.metricoolStatus.textContent = "Connect this project to one Metricool brand before publishing.";
    elements.metricoolBrandSelect.innerHTML = '<option value="">Not connected</option>';
    elements.metricoolChannelHint.textContent =
      "Metricool publishes to the connected channel for each supported network inside that brand.";
    return;
  }

  elements.projectName.textContent = project.name;
  elements.brandNameInput.value = project.name;
}

function renderMetricoolSettings(project) {
  elements.metricoolBrandSelect.textContent = "";

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "Not connected";
  elements.metricoolBrandSelect.appendChild(emptyOption);

  const brands = state.metricoolBrands || [];
  const currentBlogId = project?.metricool?.blogId || "";

  brands.forEach((brand) => {
    const option = document.createElement("option");
    option.value = brand.blogId;
    option.textContent = brand.label;
    elements.metricoolBrandSelect.appendChild(option);
  });

  if (project?.metricool?.brandLabel && currentBlogId && !brands.some((brand) => brand.blogId === currentBlogId)) {
    const fallbackOption = document.createElement("option");
    fallbackOption.value = currentBlogId;
    fallbackOption.textContent = project.metricool.brandLabel;
    elements.metricoolBrandSelect.appendChild(fallbackOption);
  }

  elements.metricoolBrandSelect.value = currentBlogId;

  const configured = project?.metricool?.configured;
  if (!configured) {
    elements.metricoolStatus.textContent = "Metricool API is not configured in the server yet.";
    elements.metricoolChannelHint.textContent =
      "Add METRICOOL_API_TOKEN and METRICOOL_USER_ID on the server before syncing brands.";
    elements.metricoolBrandSelect.disabled = true;
    elements.syncMetricoolBrandsButton.disabled = true;
    return;
  }

  elements.metricoolBrandSelect.disabled = false;
  elements.syncMetricoolBrandsButton.disabled = false;

  if (!currentBlogId) {
    elements.metricoolStatus.textContent = "This project is not linked to a Metricool brand yet.";
    elements.metricoolChannelHint.textContent =
      "Sync brands, select one, and save the project. Media publishing also needs PUBLIC_APP_URL to point to a public HTTPS domain.";
    return;
  }

  const timezone = project.metricool?.timezone || "UTC";
  const channels = Object.entries(project.metricool?.channels || {})
    .filter(([, value]) => value)
    .map(([platform, value]) => `${platform}: ${value}`);
  const publishableCount = getPublishableAccounts(project).length;

  elements.metricoolStatus.textContent = `Linked to ${project.metricool.brandLabel || "Metricool brand"} • timezone ${timezone}`;
  elements.metricoolChannelHint.textContent = channels.length
    ? `Connected channels: ${channels.join(" • ")} • publish-ready accounts: ${publishableCount}`
    : "This Metricool brand is linked, but no supported channels were detected yet.";
}

function formatPublishJobStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) {
    return "unknown";
  }

  return normalized.replaceAll("-", " ");
}

function renderPublishJobs(project) {
  elements.publishJobsList.textContent = "";

  if (!project) {
    elements.publishJobsList.innerHTML = '<div class="empty-state">No project selected.</div>';
    return;
  }

  if (!project.publishJobs?.length) {
    elements.publishJobsList.innerHTML = '<div class="empty-state">No publish jobs yet.</div>';
    return;
  }

  project.publishJobs.slice(0, 5).forEach((job) => {
    const card = document.createElement("article");
    card.className = "history-card";
    const pills = [
      `<span class="pill">${escapeHtml(job.platform)}</span>`,
      `<span class="pill">${escapeHtml(job.mode)}</span>`,
      `<span class="pill">${escapeHtml(formatPublishJobStatus(job.status))}</span>`,
    ].join("");

    card.innerHTML = `
      <div class="history-title-row">
        <h4>${escapeHtml(job.accountLabel || job.platform)}</h4>
        <div class="sample-actions">${pills}</div>
      </div>
      <div class="history-meta">${escapeHtml(formatDateTime(job.scheduledFor))}</div>
      ${job.errorMessage ? `<p class="muted-copy">${escapeHtml(job.errorMessage)}</p>` : ""}
    `;
    elements.publishJobsList.appendChild(card);
  });
}

function renderSampleAccountOptions(project) {
  elements.sampleAccountInput.textContent = "";

  const projectWideOption = document.createElement("option");
  projectWideOption.value = "";
  projectWideOption.textContent = "Project-wide";
  elements.sampleAccountInput.appendChild(projectWideOption);

  if (!project) {
    return;
  }

  project.accounts.forEach((account) => {
    const option = document.createElement("option");
    option.value = account.id;
    option.textContent = `${account.platform} / ${getAccountLabelText(account)}`;
    elements.sampleAccountInput.appendChild(option);
  });
}

function renderGenerationModes() {
  elements.generationTypeList.textContent = "";

  generationModes.forEach((mode) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `mode-card${state.generationType === mode.id ? " is-active" : ""}`;
    button.innerHTML = `
      <span class="mode-title">${escapeHtml(mode.title)}</span>
      <span class="mode-copy">${escapeHtml(mode.description)}</span>
    `;
    button.addEventListener("click", () => {
      state.generationType = mode.id;
      renderGenerationModes();
    });
    elements.generationTypeList.appendChild(button);
  });
}

function renderAccounts(project) {
  elements.accountGrid.textContent = "";

  if (!project) {
    elements.accountGrid.innerHTML = '<div class="empty-state">No project selected.</div>';
    return;
  }

  if (!project.metricool?.blogId) {
    elements.accountGrid.innerHTML = '<div class="empty-state">Select a Metricool brand to load its real connected channels.</div>';
    return;
  }

  if (!project.accounts.length) {
    elements.accountGrid.innerHTML = '<div class="empty-state">This Metricool brand has no supported connected channels yet.</div>';
    return;
  }

  const template = document.querySelector("#accountCardTemplate");

  project.accounts.forEach((account) => {
    const node = template.content.firstElementChild.cloneNode(true);
    const preview = node.querySelector(".account-preview");
    const enabledInput = node.querySelector(".account-enabled");
    const connectedChannel = node.querySelector(".account-connected-channel");
    const networkValue = node.querySelector(".account-network");
    const metricoolStatus = node.querySelector(".account-metricool-status");

    const refreshPreview = () => {
      preview.textContent = "";
      preview.appendChild(buildAccountLabel(account));
    };

    refreshPreview();
    connectedChannel.textContent = getMetricoolChannelLabel(project, account) || "Not connected";
    networkValue.textContent = account.metricoolNetwork || getDefaultMetricoolNetwork(account.platform) || "Not mapped";
    enabledInput.checked = Boolean(account.metricoolPublishEnabled);

    const refreshRoutingStatus = () => {
      const routing = getMetricoolRouting(project, account);
      metricoolStatus.textContent = routing.warning ? `${routing.summary} ${routing.warning}` : routing.summary;
      metricoolStatus.dataset.tone = routing.tone;
    };

    enabledInput.addEventListener("change", (event) => {
      account.metricoolPublishEnabled = event.target.checked;
      refreshRoutingStatus();
      renderMetricoolSettings(project);
      renderSampleAccountOptions(project);
      renderOutputPanel(project);
    });

    refreshRoutingStatus();
    elements.accountGrid.appendChild(node);
  });
}

function renderSamples(project) {
  elements.sampleList.textContent = "";

  if (!project) {
    elements.sampleList.innerHTML = '<div class="empty-state">No project selected.</div>';
    elements.sampleToggleButton.hidden = true;
    return;
  }

  if (!project.samples.length) {
    elements.sampleList.innerHTML = '<div class="empty-state">No samples yet. Add a post link to build the reference library.</div>';
    elements.sampleToggleButton.hidden = true;
    return;
  }

  const expandedLibrary = getSampleLibraryExpanded(project.id);
  const visibleSamples = expandedLibrary ? project.samples : project.samples.slice(0, 5);

  visibleSamples.forEach((sample) => {
    const card = document.createElement("article");
    const safeUrl = getSafeExternalUrl(sample.url);
    const accountLine = sample.accountLabel ? ` • ${escapeHtml(sample.accountLabel)}` : " • Project-wide";
    const sampleBody = sample.body?.trim()
      ? sample.body
      : "";
    const collapsible = isSampleCollapsible(sample, sampleBody);
    const isExpanded = !collapsible || getSampleExpanded(sample.id);
    card.className = `sample-card${!isExpanded ? " is-collapsed" : ""}`;

    if (!isExpanded) {
      card.innerHTML = `
        <div class="history-title-row">
          <h4>Reference sample</h4>
          <div class="sample-actions">
            <span class="pill">${escapeHtml(sample.sampleType || "general")}</span>
            <span class="pill">${escapeHtml(formatReviewStatus(sample.reviewStatus))}</span>
            <button class="ghost-button small-button sample-open" type="button">Open</button>
            <button class="ghost-button small-button sample-delete" type="button">Delete</button>
          </div>
        </div>
        <div class="sample-meta">${escapeHtml(formatDate(sample.publishedAt))}${accountLine}${safeUrl ? ` • <a href="${escapeHtml(safeUrl)}" target="_blank" rel="noreferrer">source link</a>` : ""}</div>
        <p class="sample-preview">${escapeHtml(buildSamplePreview(sampleBody))}</p>
      `;

      const openButton = card.querySelector(".sample-open");
      const deleteButton = card.querySelector(".sample-delete");

      openButton.addEventListener("click", () => {
        setSampleExpanded(sample.id, true);
        renderSamples(project);
      });

      deleteButton.addEventListener("click", async () => {
        const confirmed = window.confirm("Delete this sample? This cannot be undone.");
        if (!confirmed) {
          return;
        }

        await withButtonState(deleteButton, "Deleting...", async () => {
          try {
            await deleteSample(sample.id);
          } catch (error) {
            window.alert(error.message);
          }
        });
      });

      elements.sampleList.appendChild(card);
      return;
    }

    card.innerHTML = `
      <div class="history-title-row">
        <h4>Reference sample</h4>
        <div class="sample-actions">
          <span class="pill">${escapeHtml(sample.sampleType || "general")}</span>
          <span class="pill">${escapeHtml(formatReviewStatus(sample.reviewStatus))}</span>
          <span class="pill">${escapeHtml(formatSampleMode(sample.mode))}</span>
          ${collapsible ? '<button class="ghost-button small-button sample-collapse" type="button">Collapse</button>' : ""}
          <button class="ghost-button small-button sample-delete" type="button">Delete</button>
        </div>
      </div>
      <div class="sample-meta">${escapeHtml(formatDate(sample.publishedAt))}${accountLine}${safeUrl ? ` • <a href="${escapeHtml(safeUrl)}" target="_blank" rel="noreferrer">source link</a>` : ""}</div>
      <div class="field-grid compact-grid sample-edit-grid">
        <label class="field">
          <span>Type</span>
          <select class="sample-type-select">
            <option value="general"${sample.sampleType === "general" ? " selected" : ""}>General</option>
            <option value="update"${sample.sampleType === "update" ? " selected" : ""}>Update</option>
            <option value="trending"${sample.sampleType === "trending" ? " selected" : ""}>Trending</option>
          </select>
        </label>
        <label class="field field-wide">
          <span>Sample text</span>
          <textarea class="sample-body-input" rows="4" placeholder="Paste or edit the sample text before accepting it.">${escapeHtml(sampleBody)}</textarea>
        </label>
      </div>
      ${
        !sampleBody.trim()
          ? '<p class="muted-copy sample-note">This sample has no usable text yet. It will not influence generation until you edit and save it.</p>'
          : !sample.isUsable
            ? '<p class="muted-copy sample-note">This text is treated as low-quality or boilerplate and will not influence generation until you replace it with a real post example.</p>'
            : sample.reviewStatus !== "accepted"
              ? '<p class="muted-copy sample-note">This sample is not active yet. Saving it will approve it for future generation.</p>'
              : '<p class="muted-copy sample-note">Accepted samples are eligible for style matching during generation.</p>'
      }
      <div class="sample-actions sample-editor-actions">
        <button class="primary-button small-button sample-save sample-save-button" type="button">Save sample</button>
      </div>
    `;

    const deleteButton = card.querySelector(".sample-delete");
    const collapseButton = card.querySelector(".sample-collapse");
    const saveButton = card.querySelector(".sample-save");
    const typeSelect = card.querySelector(".sample-type-select");
    const bodyInput = card.querySelector(".sample-body-input");

    const persist = async () => {
      const nextBody = bodyInput.value.trim();
      if (!nextBody) {
        window.alert("Accepted samples need usable sample text.");
        return;
      }

      await updateSample(sample.id, {
        body: nextBody,
        sampleType: typeSelect.value,
        reviewStatus: "accepted",
      });
    };

    saveButton.addEventListener("click", async () => {
      await withButtonState(saveButton, "Saving...", async () => {
        try {
          setSampleExpanded(sample.id, false);
          await persist();
        } catch (error) {
          setSampleExpanded(sample.id, true);
          window.alert(error.message);
        }
      });
    });

    collapseButton?.addEventListener("click", () => {
      setSampleExpanded(sample.id, false);
      renderSamples(project);
    });

    deleteButton.addEventListener("click", async () => {
      const confirmed = window.confirm("Delete this sample? This cannot be undone.");
      if (!confirmed) {
        return;
      }

      await withButtonState(deleteButton, "Deleting...", async () => {
        try {
          await deleteSample(sample.id);
        } catch (error) {
          window.alert(error.message);
        }
      });
    });
    elements.sampleList.appendChild(card);
  });

  if (project.samples.length > 5) {
    elements.sampleToggleButton.hidden = false;
    elements.sampleToggleButton.textContent = expandedLibrary
      ? "Show latest 5 samples"
      : `Show ${project.samples.length - 5} older samples`;
  } else {
    elements.sampleToggleButton.hidden = true;
  }
}

function renderAssetSummary() {
  const imageRows = state.selectedAssets.images.map((file) => `Image • ${file.name} • ${formatFileSize(file.size)}`);
  const videoRows = state.selectedAssets.video
    ? [`Video • ${state.selectedAssets.video.name} • ${formatFileSize(state.selectedAssets.video.size)}`]
    : [];
  const rows = [...imageRows, ...videoRows];

  if (!rows.length) {
    elements.assetSummary.className = "asset-summary empty-state";
    elements.assetSummary.textContent = "No assets selected yet. Upload one image set or one video before generating.";
    return;
  }

  elements.assetSummary.className = "asset-summary output-card";
  elements.assetSummary.innerHTML = `
    <h4>Selected assets</h4>
    <p class="output-body">${escapeHtml(rows.join("\n"))}</p>
  `;
}

function buildInsightBlock(title, values = []) {
  if (!values.length) {
    return "";
  }

  return `
    <div class="insight-block">
      <h5>${escapeHtml(title)}</h5>
      <div class="insight-list">${values.map((value) => `<span class="pill">${escapeHtml(value)}</span>`).join("")}</div>
    </div>
  `;
}

function renderAssetInsights(project) {
  const insights = project?.latestAssetInsights;

  if (!insights) {
    elements.assetInsightsPanel.className = "asset-summary empty-state";
    elements.assetInsightsPanel.textContent =
      "Run a generation to inspect extracted dates, updates, rewards, visible text, and frame-level notes.";
    return;
  }

  const sections = [
    buildInsightBlock("Media breakdown", insights.mediaBreakdown || []),
    buildInsightBlock("Key details", insights.keyDetails || []),
    buildInsightBlock("Visible text", insights.visibleText || []),
    buildInsightBlock("Dates", insights.dates || []),
    buildInsightBlock("Rewards", insights.rewards || []),
    buildInsightBlock("Update items", insights.updateItems || []),
    buildInsightBlock("Trend clues", insights.trendClues || []),
  ]
    .filter(Boolean)
    .join("");

  elements.assetInsightsPanel.className = "asset-summary output-card";
  elements.assetInsightsPanel.innerHTML = `
    <div class="history-title-row">
      <h4>Extracted asset signals</h4>
      ${insights.generationType ? `<span class="pill">${escapeHtml(insights.generationType)}</span>` : ""}
    </div>
    <p class="output-body">${escapeHtml(insights.summary || "No extracted summary available.")}</p>
    ${insights.trendContext?.summary ? `<p class="muted-copy extraction-trend"><strong>Trend context:</strong> ${escapeHtml(insights.trendContext.summary)}</p>` : ""}
    ${sections || '<p class="muted-copy">No detailed fields were extracted for the latest run.</p>'}
  `;
}

function renderOutputPanel(project) {
  elements.outputPanel.textContent = "";

  if (!project) {
    elements.outputPanel.innerHTML = '<div class="empty-state">No project selected.</div>';
    return;
  }

  const output = project.draftOutputs.general;
  if (!output) {
    elements.outputPanel.innerHTML = '<div class="empty-state">No output available yet.</div>';
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "output-card";

  const metaMarkup = (output.meta || []).map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("");

  wrapper.innerHTML = `
    <h4>${escapeHtml(output.heading)}</h4>
    <div class="output-meta">${metaMarkup}</div>
    <div class="output-panel"></div>
  `;

  const nestedPanel = wrapper.querySelector(".output-panel");
  (output.entries || []).forEach((entry) => {
    nestedPanel.appendChild(buildOutputEntryCard(project, entry));
  });

  elements.outputPanel.appendChild(wrapper);
}

function buildOutputEntryCard(project, entry) {
  const card = document.createElement("article");
  card.className = "output-card output-entry-card";

  const header = document.createElement("div");
  header.className = "output-entry-head";

  const title = document.createElement("h4");
  title.textContent = entry.label;
  header.appendChild(title);

  const headerActions = document.createElement("div");
  headerActions.className = "output-entry-status";

  if (entry.isPreferred) {
    const preferredPill = document.createElement("span");
    preferredPill.className = "pill";
    preferredPill.textContent = "Preferred";
    headerActions.appendChild(preferredPill);
  }

  header.appendChild(headerActions);
  card.appendChild(header);

  (entry.fields || []).forEach((field) => {
    const label = document.createElement("label");
    label.className = "field";

    const labelText = document.createElement("span");
    labelText.textContent = field.label;
    label.appendChild(labelText);

    const input = field.multiline ? document.createElement("textarea") : document.createElement("input");
    if (!field.multiline) {
      input.type = "text";
    } else {
      input.rows = field.key === "body" ? 5 : 3;
    }
    input.value = field.value || "";
    input.placeholder = field.placeholder || "";
    input.dataset.outputField = field.key;
    input.disabled = !entry.id;
    label.appendChild(input);

    card.appendChild(label);
  });

  const actions = document.createElement("div");
  actions.className = "output-entry-actions";

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "ghost-button small-button";
  copyButton.textContent = "Copy";
  copyButton.addEventListener("click", async () => {
    try {
      await copyOutputEntry(card, entry);
      copyButton.textContent = "Copied";
      window.setTimeout(() => {
        copyButton.textContent = "Copy";
      }, 900);
    } catch (error) {
      window.alert(error.message);
    }
  });
  actions.appendChild(copyButton);

  if (entry.id) {
    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "secondary-button small-button";
    saveButton.textContent = "Save";
    saveButton.addEventListener("click", async () => {
      await withButtonState(saveButton, "Saving...", async () => {
        try {
          await persistOutputEntry(project.id, entry.id, collectOutputFieldValues(card));
        } catch (error) {
          window.alert(error.message);
        }
      });
    });
    actions.appendChild(saveButton);

    if (!entry.isPreferred) {
      const preferredButton = document.createElement("button");
      preferredButton.type = "button";
      preferredButton.className = "primary-button small-button";
      preferredButton.textContent = "Mark preferred";
      preferredButton.addEventListener("click", async () => {
        await withButtonState(preferredButton, "Saving...", async () => {
          try {
            await persistOutputEntry(project.id, entry.id, collectOutputFieldValues(card), { isPreferred: true });
          } catch (error) {
            window.alert(error.message);
          }
        });
      });
      actions.appendChild(preferredButton);
    }
  } else {
    const hint = document.createElement("p");
    hint.className = "muted-copy output-entry-hint";
    hint.textContent = "Generate a draft first to edit and save this output.";
    actions.appendChild(hint);
  }

  card.appendChild(actions);

  if (entry.id) {
    const publishBox = document.createElement("div");
    publishBox.className = "publish-box";

    if (!project.metricool?.configured) {
      publishBox.innerHTML = '<p class="muted-copy">Metricool is not configured on the server yet.</p>';
      card.appendChild(publishBox);
      return card;
    }

    if (!project.metricool?.blogId) {
      publishBox.innerHTML = '<p class="muted-copy">Link this project to a Metricool brand before publishing.</p>';
      card.appendChild(publishBox);
      return card;
    }

    const publishableAccounts = getPublishableAccounts(project);
    if (!publishableAccounts.length) {
      publishBox.innerHTML = '<p class="muted-copy">Mark at least one enabled account for Metricool publishing and make sure the selected brand already has that channel connected.</p>';
      card.appendChild(publishBox);
      return card;
    }

    publishBox.innerHTML = `
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Publishing</p>
          <h4>Metricool publish</h4>
        </div>
      </div>
      <div class="field-grid compact-grid">
        <label class="field">
          <span>Target account</span>
          <select class="publish-account-select"></select>
        </label>
        <label class="field">
          <span>Schedule time</span>
          <input class="publish-schedule-input" type="datetime-local" />
        </label>
        <label class="field field-wide">
          <span>Publish title</span>
          <input class="publish-title-input" type="text" placeholder="Optional. Used when the target channel needs a title." />
        </label>
      </div>
      <p class="muted-copy publish-target-note"></p>
      <p class="muted-copy publish-note">Immediate publishing sends the output to Metricool right away. Scheduled publishing depends on this app server staying online so the queued job can be submitted on time. Scheduled time uses the linked Metricool brand timezone.</p>
      <div class="output-entry-actions">
        <button class="secondary-button small-button publish-now-button" type="button">Publish now</button>
        <button class="primary-button small-button publish-schedule-button" type="button">Schedule</button>
      </div>
    `;

    const accountSelect = publishBox.querySelector(".publish-account-select");
    const scheduleInput = publishBox.querySelector(".publish-schedule-input");
    const publishTitleInput = publishBox.querySelector(".publish-title-input");
    const publishTargetNote = publishBox.querySelector(".publish-target-note");
    const publishNowButton = publishBox.querySelector(".publish-now-button");
    const publishScheduleButton = publishBox.querySelector(".publish-schedule-button");

    const refreshTargetNote = () => {
      const selectedAccount = publishableAccounts.find((account) => account.id === accountSelect.value) || publishableAccounts[0];
      const routing = getMetricoolRouting(project, selectedAccount);
      publishTargetNote.textContent = routing.warning
        ? `${routing.summary} ${routing.warning}`
        : routing.summary;
    };

    publishableAccounts.forEach((account) => {
      const routing = getMetricoolRouting(project, account);
      const option = document.createElement("option");
      option.value = account.id;
      option.textContent = `${account.platform} / ${getAccountLabelText(account)} -> ${routing.connectedChannel || "unlinked"}`;
      accountSelect.appendChild(option);
    });

    scheduleInput.value = toDateTimeLocalValue();
    refreshTargetNote();
    accountSelect.addEventListener("change", refreshTargetNote);

    const submitPublish = async (mode) => {
      const values = collectOutputFieldValues(card);
      const publishBody = String(values.body || "").trim();
      const publishTitle = String(publishTitleInput.value || values.title || "").trim();

      if (!publishBody) {
        throw new Error("Save or generate some output text before publishing.");
      }

      await createPublishJob(project.id, {
        outputId: entry.id,
        accountId: accountSelect.value,
        mode,
        scheduledAt: mode === "schedule" ? new Date(scheduleInput.value).toISOString() : undefined,
        publishTitle,
        publishBody,
      });

      window.alert(mode === "schedule" ? "Queued for scheduled submission to Metricool." : "Submitted to Metricool.");
    };

    publishNowButton.addEventListener("click", async () => {
      await withButtonState(publishNowButton, "Publishing...", async () => {
        try {
          await submitPublish("now");
        } catch (error) {
          window.alert(error.message);
        }
      });
    });

    publishScheduleButton.addEventListener("click", async () => {
      await withButtonState(publishScheduleButton, "Scheduling...", async () => {
        try {
          await submitPublish("schedule");
        } catch (error) {
          window.alert(error.message);
        }
      });
    });

    card.appendChild(publishBox);
  }

  return card;
}

function collectOutputFieldValues(card) {
  return Array.from(card.querySelectorAll("[data-output-field]")).reduce((payload, input) => {
    payload[input.dataset.outputField] = input.value;
    return payload;
  }, {});
}

async function copyOutputEntry(card, entry) {
  const values = collectOutputFieldValues(card);
  const text = (entry.fields || [])
    .map((field) => {
      const value = values[field.key] || "";
      if (!value.trim()) {
        return "";
      }

      if ((entry.fields || []).length === 1) {
        return value.trim();
      }

      return `${field.label}\n${value.trim()}`;
    })
    .filter(Boolean)
    .join("\n\n");

  if (!text) {
    throw new Error("Nothing to copy yet.");
  }

  await navigator.clipboard.writeText(text);
}

async function persistOutputEntry(projectId, outputId, values, options = {}) {
  const payload = await apiRequest(`/api/projects/${projectId}/outputs/${outputId}`, {
    method: "PUT",
    json: {
      title: values.title,
      body: values.body,
      ...(options.isPreferred === true ? { isPreferred: true } : {}),
    },
  });

  applyPayload(payload);
}

function renderHistory(project) {
  elements.historyList.textContent = "";

  if (!project) {
    elements.historyList.innerHTML = '<div class="empty-state">No project selected.</div>';
    elements.historyToggleButton.hidden = true;
    return;
  }

  if (!project.history.length) {
    elements.historyList.innerHTML = '<div class="empty-state">No generation runs yet.</div>';
    elements.historyToggleButton.hidden = true;
    return;
  }

  const expanded = getHistoryExpanded(project.id);
  const visibleEntries = expanded ? project.history : project.history.slice(0, 3);

  visibleEntries.forEach((entry) => {
    const card = document.createElement("article");
    card.className = "history-card";
    const pills = [
      entry.generationType ? `<span class="pill">${escapeHtml(entry.generationType)}</span>` : "",
      entry.provider ? `<span class="pill">${escapeHtml(entry.provider)}</span>` : "",
      entry.status ? `<span class="pill">${escapeHtml(entry.status)}</span>` : "",
    ]
      .filter(Boolean)
      .join("");

    card.innerHTML = `
      <div class="history-title-row">
        <h4>${escapeHtml(entry.title)}</h4>
        <div class="sample-actions">${pills}</div>
      </div>
      <div class="history-meta">${escapeHtml(entry.createdAt)}</div>
    `;
    elements.historyList.appendChild(card);
  });

  if (project.history.length > 3) {
    elements.historyToggleButton.hidden = false;
    elements.historyToggleButton.textContent = expanded
      ? "Show latest 3"
      : `Show ${project.history.length - 3} older`;
  } else {
    elements.historyToggleButton.hidden = true;
  }
}

function renderGenerationControls() {
  elements.generateButton.disabled = state.isGenerating || state.isCancellingGeneration || !hasSelectedAssets();
  elements.generateButton.textContent = state.isGenerating ? "Generating..." : "Generate drafts";
  elements.stopGenerateButton.hidden = !state.isGenerating;
  elements.stopGenerateButton.disabled = state.isCancellingGeneration;
  elements.stopGenerateButton.textContent = state.isCancellingGeneration ? "Stopping..." : "Stop";
}

function render() {
  const project = getActiveProject();
  elements.generationModeHint.textContent =
    state.generatorMode === "openai"
      ? "Mode: OpenAI-compatible API"
      : state.generatorMode === "gateway"
        ? "Mode: Leihuo Gateway API"
        : "Mode: local fallback";
  renderProjectSelect();
  populateProjectFields(project);
  renderMetricoolSettings(project);
  renderAccounts(project);
  renderSampleAccountOptions(project);
  renderSamples(project);
  renderAssetSummary();
  renderGenerationModes();
  renderAssetInsights(project);
  renderGenerationControls();
  renderOutputPanel(project);
  renderPublishJobs(project);
  renderHistory(project);
}

async function withButtonState(button, busyLabel, task) {
  const previousLabel = button.textContent;
  button.disabled = true;
  button.textContent = busyLabel;

  try {
    await task();
  } finally {
    button.disabled = false;
    button.textContent = previousLabel;
  }
}

async function saveProjectEdits() {
  const project = getActiveProject();
  if (!project) {
    return;
  }

  const selectedBrand = state.metricoolBrands.find((brand) => brand.blogId === elements.metricoolBrandSelect.value);
  if (selectedBrand || !elements.metricoolBrandSelect.value) {
    applySelectedMetricoolBrand(project, selectedBrand || null);
  }
  const metricoolPayload = selectedBrand
    ? {
        metricoolBlogId: selectedBrand.blogId,
        metricoolBrandLabel: selectedBrand.label,
        metricoolBrandTimezone: selectedBrand.timezone,
        metricoolBrandChannels: selectedBrand.channels || {},
      }
    : elements.metricoolBrandSelect.value && elements.metricoolBrandSelect.value === project.metricool?.blogId
      ? {
          metricoolBlogId: project.metricool.blogId,
          metricoolBrandLabel: project.metricool.brandLabel,
          metricoolBrandTimezone: project.metricool.timezone,
          metricoolBrandChannels: project.metricool.channels || {},
        }
    : {
        metricoolBlogId: "",
        metricoolBrandLabel: "",
        metricoolBrandTimezone: "",
        metricoolBrandChannels: {},
      };

  const payload = await apiRequest(`/api/projects/${project.id}`, {
    method: "PUT",
    json: {
      name: elements.brandNameInput.value.trim() || project.name,
      accounts: project.accounts,
      ...metricoolPayload,
    },
  });

  applyPayload(payload);
}

async function addSample() {
  const project = getActiveProject();
  if (!project) {
    return;
  }

  const url = elements.sampleLinkInput.value.trim();

  if (!url) {
    window.alert("Add a post link to import a sample.");
    return;
  }

  const payload = await apiRequest(`/api/projects/${project.id}/samples`, {
    method: "POST",
    json: {
      accountId: elements.sampleAccountInput.value || null,
      sampleType: elements.sampleTypeInput.value,
      url,
    },
  });

  elements.sampleLinkInput.value = "";
  elements.sampleAccountInput.value = "";
  elements.sampleTypeInput.value = "general";
  applyPayload(payload);
}

async function updateSample(sampleId, values) {
  const project = getActiveProject();
  if (!project) {
    return;
  }

  const payload = await apiRequest(`/api/projects/${project.id}/samples/${sampleId}`, {
    method: "PUT",
    json: values,
  });

  applyPayload(payload);
}

async function deleteSample(sampleId) {
  const project = getActiveProject();
  if (!project) {
    return;
  }

  const payload = await apiRequest(`/api/projects/${project.id}/samples/${sampleId}`, {
    method: "DELETE",
  });

  applyPayload(payload);
}

async function syncMetricoolBrands() {
  const payload = await apiRequest("/api/integrations/metricool/brands");
  applyPayload(payload);
}

async function createPublishJob(projectId, values) {
  const payload = await apiRequest(`/api/projects/${projectId}/publish-jobs`, {
    method: "POST",
    json: values,
  });

  applyPayload(payload);
}

function applySelectedMetricoolBrand(project, selectedBrand) {
  if (!project) {
    return;
  }

  project.metricool = selectedBrand
    ? {
        configured: project.metricool?.configured ?? true,
        blogId: selectedBrand.blogId,
        brandLabel: selectedBrand.label,
        timezone: selectedBrand.timezone,
        channels: selectedBrand.channels || {},
      }
    : {
        configured: project.metricool?.configured ?? true,
        blogId: "",
        brandLabel: "",
        timezone: "",
        channels: {},
      };

  project.accounts = buildAccountsFromMetricoolBrand(project, selectedBrand);
}

async function duplicateProject() {
  const project = getActiveProject();
  if (!project) {
    return;
  }

  const payload = await apiRequest(`/api/projects/${project.id}/clone`, { method: "POST" });
  applyPayload(payload);
}

async function createProject() {
  const payload = await apiRequest("/api/projects", {
    method: "POST",
    json: {
      name: "New Brand",
    },
  });
  applyPayload(payload);
}

async function generateDrafts() {
  const project = getActiveProject();
  if (!project) {
    return;
  }

  if (!hasSelectedAssets()) {
    window.alert("Upload at least one image set or one video first.");
    return;
  }

  const formData = new FormData();
  state.selectedAssets.images.forEach((image) => {
    formData.append("images", image);
  });

  if (state.selectedAssets.video) {
    formData.append("video", state.selectedAssets.video);
  }

  formData.append("generationType", state.generationType);

  state.isGenerating = true;
  state.isCancellingGeneration = false;
  state.generationAbortController = new AbortController();
  renderGenerationControls();

  try {
    const payload = await apiRequest(`/api/projects/${project.id}/generations`, {
      method: "POST",
      formData,
      signal: state.generationAbortController.signal,
    });

    state.selectedAssets.images = [];
    state.selectedAssets.video = null;
    elements.imageUploadInput.value = "";
    elements.videoUploadInput.value = "";
    applyPayload(payload);
  } catch (error) {
    if (error.name !== "AbortError" && error.message !== "Generation cancelled.") {
      throw error;
    }
  } finally {
    state.isGenerating = false;
    state.isCancellingGeneration = false;
    state.generationAbortController = null;
    renderGenerationControls();
  }
}

async function stopGeneration() {
  const project = getActiveProject();
  if (!project || !state.isGenerating) {
    return;
  }

  state.isCancellingGeneration = true;
  renderGenerationControls();

  try {
    const payload = await apiRequest(`/api/projects/${project.id}/generations/cancel`, {
      method: "POST",
    });
    state.generationAbortController?.abort();
    applyPayload(payload);
  } finally {
    state.isGenerating = false;
    state.isCancellingGeneration = false;
    state.generationAbortController = null;
    renderGenerationControls();
  }
}

function bindEvents() {
  elements.projectSelect.addEventListener("change", (event) => {
    state.activeProjectId = event.target.value;
    render();
  });

  elements.saveProjectButton.addEventListener("click", async () => {
    await withButtonState(elements.saveProjectButton, "Saving...", async () => {
      try {
        await saveProjectEdits();
      } catch (error) {
        window.alert(error.message);
      }
    });
  });

  elements.addSampleButton.addEventListener("click", async () => {
    await withButtonState(elements.addSampleButton, "Adding...", async () => {
      try {
        await addSample();
      } catch (error) {
        window.alert(error.message);
      }
    });
  });

  elements.newProjectButton.addEventListener("click", async () => {
    await withButtonState(elements.newProjectButton, "Creating...", async () => {
      try {
        await createProject();
      } catch (error) {
        window.alert(error.message);
      }
    });
  });

  elements.duplicateProjectButton.addEventListener("click", async () => {
    await withButtonState(elements.duplicateProjectButton, "Cloning...", async () => {
      try {
        await duplicateProject();
      } catch (error) {
        window.alert(error.message);
      }
    });
  });

  elements.generateButton.addEventListener("click", async () => {
    try {
      await generateDrafts();
    } catch (error) {
      window.alert(error.message);
    }
  });

  elements.stopGenerateButton.addEventListener("click", async () => {
    try {
      await stopGeneration();
    } catch (error) {
      window.alert(error.message);
    }
  });

  elements.syncMetricoolBrandsButton.addEventListener("click", async () => {
    await withButtonState(elements.syncMetricoolBrandsButton, "Syncing...", async () => {
      try {
        await syncMetricoolBrands();
      } catch (error) {
        window.alert(error.message);
      }
    });
  });

  elements.metricoolBrandSelect.addEventListener("change", (event) => {
    const project = getActiveProject();
    if (!project) {
      return;
    }

    const selectedBrand = state.metricoolBrands.find((brand) => brand.blogId === event.target.value);
    applySelectedMetricoolBrand(project, selectedBrand);
    render();
  });

  elements.historyToggleButton.addEventListener("click", () => {
    const project = getActiveProject();
    if (!project || project.history.length <= 3) {
      return;
    }

    setHistoryExpanded(project.id, !getHistoryExpanded(project.id));
    renderHistory(project);
  });

  elements.sampleToggleButton.addEventListener("click", () => {
    const project = getActiveProject();
    if (!project || project.samples.length <= 5) {
      return;
    }

    setSampleLibraryExpanded(project.id, !getSampleLibraryExpanded(project.id));
    renderSamples(project);
  });

  elements.imageUploadInput.addEventListener("change", (event) => {
    state.selectedAssets.images = Array.from(event.target.files || []);
    if (state.selectedAssets.images.length) {
      elements.videoUploadInput.value = "";
      state.selectedAssets.video = null;
    }
    renderAssetSummary();
    renderGenerationControls();
  });

  elements.videoUploadInput.addEventListener("change", (event) => {
    const files = Array.from(event.target.files || []);
    state.selectedAssets.video = files[0] || null;
    if (state.selectedAssets.video) {
      elements.imageUploadInput.value = "";
      state.selectedAssets.images = [];
    }
    renderAssetSummary();
    renderGenerationControls();
  });
}

bindEvents();
render();

loadProjects().catch((error) => {
  window.alert(`Failed to load projects: ${error.message}`);
});
