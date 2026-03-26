const state = {
  projects: [],
  activeProjectId: "",
  activeTab: "project",
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
  selectedPublishOutputId: "",
  selectedPublishAccountId: "",
};

const tabs = [
  { id: "project", label: "Project" },
  { id: "samples", label: "Samples" },
  { id: "create", label: "Create" },
  { id: "outputs", label: "Outputs" },
  { id: "publish", label: "Publish" },
];

const generationModes = [
  {
    id: "update",
    title: "Update & events",
    description: "For patch notes, event updates, dates, rewards, and similar fact-heavy materials.",
  },
  {
    id: "trending",
    title: "Trending",
    description: "For social hot-topic tie-ins after live trend confirmation.",
  },
  {
    id: "general",
    title: "General",
    description: "For everything else, shaped by asset signals and approved recent posts.",
  },
];

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

const elements = {
  projectSelect: document.querySelector("#projectSelect"),
  newProjectButton: document.querySelector("#newProjectButton"),
  tabNav: document.querySelector("#tabNav"),
  projectWorkspace: document.querySelector("#projectWorkspace"),
  projectName: document.querySelector("#projectName"),
  projectHeroHint: document.querySelector("#projectHeroHint"),
  deleteProjectButton: document.querySelector("#deleteProjectButton"),
  saveProjectButton: document.querySelector("#saveProjectButton"),
  brandNameInput: document.querySelector("#brandNameInput"),
  metricoolStatus: document.querySelector("#metricoolStatus"),
  metricoolBrandSelect: document.querySelector("#metricoolBrandSelect"),
  metricoolChannelHint: document.querySelector("#metricoolChannelHint"),
  syncMetricoolBrandsButton: document.querySelector("#syncMetricoolBrandsButton"),
  accountGrid: document.querySelector("#accountGrid"),
  sampleLinkInput: document.querySelector("#sampleLinkInput"),
  sampleAccountInput: document.querySelector("#sampleAccountInput"),
  sampleTypeInput: document.querySelector("#sampleTypeInput"),
  addSampleButton: document.querySelector("#addSampleButton"),
  sampleList: document.querySelector("#sampleList"),
  sampleToggleButton: document.querySelector("#sampleToggleButton"),
  syncedTargetList: document.querySelector("#syncedTargetList"),
  imageUploadInput: document.querySelector("#imageUploadInput"),
  videoUploadInput: document.querySelector("#videoUploadInput"),
  assetSummary: document.querySelector("#assetSummary"),
  generationTypeList: document.querySelector("#generationTypeList"),
  assetInsightsPanel: document.querySelector("#assetInsightsPanel"),
  generationModeHint: document.querySelector("#generationModeHint"),
  generateButton: document.querySelector("#generateButton"),
  stopGenerateButton: document.querySelector("#stopGenerateButton"),
  outputPanel: document.querySelector("#outputPanel"),
  historyList: document.querySelector("#historyList"),
  historyToggleButton: document.querySelector("#historyToggleButton"),
  publishOutputSelect: document.querySelector("#publishOutputSelect"),
  publishAccountSelect: document.querySelector("#publishAccountSelect"),
  publishScheduleInput: document.querySelector("#publishScheduleInput"),
  publishTitleInput: document.querySelector("#publishTitleInput"),
  publishTargetNote: document.querySelector("#publishTargetNote"),
  publishNowButton: document.querySelector("#publishNowButton"),
  publishScheduleButton: document.querySelector("#publishScheduleButton"),
  publishJobsList: document.querySelector("#publishJobsList"),
  tabPages: Array.from(document.querySelectorAll("[data-tab-page]")),
  toast: document.querySelector("#toast"),
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

function createLocalAccount(projectName = "New Brand", platform = "Instagram") {
  return {
    id: crypto.randomUUID(),
    platform,
    accountName: `${projectName} ${platform}`,
    handle: `@${slugify(projectName)}-${platformSuffix(platform)}`,
    enabled: true,
    length: platform === "X" || platform === "TikTok" ? "short" : "medium",
    cta: platform === "Instagram" || platform === "YouTube",
    hashtags: platform === "Instagram" || platform === "TikTok",
    notes: "",
    metricoolPublishEnabled: true,
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
    .map((platform) => {
      const existing = existingByPlatform.get(platform);
      const channelValue = String(channels[platform] || "").trim();
      const base = existing || createLocalAccount(project?.name || "New Brand", platform);

      return {
        ...base,
        platform,
        accountName: channelValue,
        handle: formatMetricoolChannelHandle(platform, channelValue),
        enabled: true,
        metricoolPublishEnabled: existing?.metricoolPublishEnabled ?? true,
        metricoolNetwork: existing?.metricoolNetwork || metricoolNetworkByPlatform[platform] || "",
      };
    });
}

function getActiveProject() {
  return state.projects.find((project) => project.id === state.activeProjectId) || null;
}

function getAccountLabelText(account) {
  return account?.handle || account?.accountName || `${account?.platform || "Account"} channel`;
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

function formatGenerationTypeLabel(value) {
  if (value === "update") {
    return "Update & events";
  }

  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : "General";
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
  subtitle.textContent = account.platform;

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
  const looksMatched = doesAccountMatchMetricoolChannel(account, connectedChannel);

  if (!configured) {
    return {
      eligible: false,
      connectedChannel,
      tone: "muted",
      summary: "Metricool is not configured on the server yet.",
      warning: "",
    };
  }

  if (!blogId) {
    return {
      eligible: false,
      connectedChannel,
      tone: "muted",
      summary: "Link a Metricool brand to this project first.",
      warning: "",
    };
  }

  if (!publishEnabled) {
    return {
      eligible: false,
      connectedChannel,
      tone: "muted",
      summary: connectedChannel
        ? `This channel stays out of publishing. Connected ${account.platform} channel: ${connectedChannel}`
        : `No ${account.platform} channel is connected in the selected Metricool brand yet.`,
      warning: "",
    };
  }

  if (!connectedChannel) {
    return {
      eligible: false,
      connectedChannel,
      tone: "warning",
      summary: `Publishing is enabled, but this Metricool brand has no connected ${account.platform} channel.`,
      warning: "",
    };
  }

  return {
    eligible: true,
    connectedChannel,
    tone: looksMatched ? "success" : "warning",
    summary: `Routes to Metricool ${account.platform} channel: ${connectedChannel}`,
    warning: looksMatched
      ? ""
      : "The local label does not obviously match the connected channel, but publishing still routes there.",
  };
}

function getPublishableAccounts(project) {
  return (project?.accounts || []).filter((account) => getMetricoolRouting(project, account).eligible);
}

function getGenerationTargets(project) {
  return (project?.accounts || []).filter((account) => account.enabled !== false);
}

function getOutputEntries(project) {
  return Array.isArray(project?.draftOutputs?.entries) ? project.draftOutputs.entries : [];
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
  state.historyExpanded = {
    ...state.historyExpanded,
    [projectId]: expanded,
  };
}

function getSampleLibraryExpanded(projectId) {
  return Boolean(state.sampleLibraryExpanded[projectId]);
}

function setSampleLibraryExpanded(projectId, expanded) {
  state.sampleLibraryExpanded = {
    ...state.sampleLibraryExpanded,
    [projectId]: expanded,
  };
}

function getSampleExpanded(sampleId) {
  return Boolean(state.sampleExpanded[sampleId]);
}

function setSampleExpanded(sampleId, expanded) {
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

function truncateText(value, maxLength = 60) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) {
    return clean;
  }

  return `${clean.slice(0, maxLength - 1).trimEnd()}…`;
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

function syncMetricoolBrandsIntoProjects() {
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

function ensurePublishSelection(project) {
  const outputs = getOutputEntries(project);
  const publishableAccounts = getPublishableAccounts(project);
  const outputMatches = outputs.filter((entry) => publishableAccounts.some((account) => account.platform === entry.platform));
  const firstOutput = outputMatches[0] || outputs[0] || null;

  if (!firstOutput) {
    state.selectedPublishOutputId = "";
    state.selectedPublishAccountId = "";
    return;
  }

  if (!outputMatches.some((entry) => entry.id === state.selectedPublishOutputId)) {
    state.selectedPublishOutputId = firstOutput.id || "";
  }

  const selectedOutput = outputMatches.find((entry) => entry.id === state.selectedPublishOutputId) || firstOutput;
  const matchingAccounts = publishableAccounts.filter((account) => account.platform === selectedOutput.platform);
  const firstAccount = matchingAccounts[0] || null;

  if (!firstAccount) {
    state.selectedPublishAccountId = "";
    return;
  }

  if (!matchingAccounts.some((account) => account.id === state.selectedPublishAccountId)) {
    state.selectedPublishAccountId = firstAccount.id;
  }
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
    syncMetricoolBrandsIntoProjects();
  }

  const candidateId = payload.activeProjectId || state.activeProjectId;
  state.activeProjectId = state.projects.some((project) => project.id === candidateId)
    ? candidateId
    : state.projects[0]?.id || "";

  if (!state.projects.length) {
    state.activeTab = "project";
  }

  ensurePublishSelection(getActiveProject());
  render();
}

let toastTimer = null;

function showToast(message) {
  if (!elements.toast) {
    return;
  }

  elements.toast.textContent = message;
  elements.toast.hidden = false;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
    elements.toast.hidden = true;
  }, 1800);
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
    option.textContent = "No projects yet";
    option.value = "";
    elements.projectSelect.appendChild(option);
    elements.projectSelect.disabled = true;
    return;
  }

  state.projects.forEach((project) => {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name;
    elements.projectSelect.appendChild(option);
  });

  elements.projectSelect.disabled = false;
  elements.projectSelect.value = state.activeProjectId;
}

function renderTabs(hasProject) {
  elements.tabNav.textContent = "";

  tabs.forEach((tab) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tab-button${state.activeTab === tab.id ? " is-active" : ""}`;
    button.textContent = tab.label;
    button.disabled = !hasProject;
    button.addEventListener("click", () => {
      state.activeTab = tab.id;
      render();
      window.requestAnimationFrame(() => {
        const activePage = elements.tabPages.find((page) => page.dataset.tabPage === state.activeTab && !page.hidden);
        (activePage || elements.projectWorkspace).scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    elements.tabNav.appendChild(button);
  });
}

function renderWorkspaceShell(project) {
  const hasProject = Boolean(project);
  elements.projectWorkspace.hidden = false;
  elements.projectName.textContent = hasProject ? project.name : "No project yet";
  elements.projectHeroHint.textContent = hasProject
    ? "Use the tabs on the left to move between setup, samples, creation, outputs, and publishing."
    : "Create a project from the left first, then sync its channels and start generating.";
  elements.brandNameInput.value = hasProject ? project.name : "";
  elements.deleteProjectButton.disabled = !hasProject;
  elements.saveProjectButton.disabled = !hasProject;

  elements.tabPages.forEach((page) => {
    page.hidden = !hasProject || page.dataset.tabPage !== state.activeTab;
  });
}

function renderMetricoolSettings(project) {
  elements.metricoolBrandSelect.textContent = "";

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "Not connected";
  elements.metricoolBrandSelect.appendChild(emptyOption);

  const currentBlogId = project?.metricool?.blogId || "";
  state.metricoolBrands.forEach((brand) => {
    const option = document.createElement("option");
    option.value = brand.blogId;
    option.textContent = brand.label;
    elements.metricoolBrandSelect.appendChild(option);
  });

  if (project?.metricool?.brandLabel && currentBlogId && !state.metricoolBrands.some((brand) => brand.blogId === currentBlogId)) {
    const fallbackOption = document.createElement("option");
    fallbackOption.value = currentBlogId;
    fallbackOption.textContent = project.metricool.brandLabel;
    elements.metricoolBrandSelect.appendChild(fallbackOption);
  }

  elements.metricoolBrandSelect.value = currentBlogId;

  if (!project?.metricool?.configured) {
    elements.metricoolStatus.textContent = "Metricool API is not configured on the server yet.";
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
      "Sync brands, choose one, and save the project. Generated outputs will follow the real connected channels in that brand.";
    return;
  }

  const channels = Object.entries(project.metricool?.channels || {})
    .filter(([, value]) => value)
    .map(([platform, value]) => `${platform}: ${value}`);

  elements.metricoolStatus.textContent = `Linked to ${project.metricool.brandLabel || "Metricool brand"} • timezone ${project.metricool.timezone || "UTC"}`;
  elements.metricoolChannelHint.textContent = channels.length
    ? `Connected channels: ${channels.join(" • ")}`
    : "This Metricool brand is linked, but no supported connected channels were detected yet.";
}

function renderAccounts(project) {
  elements.accountGrid.textContent = "";

  if (!project?.metricool?.blogId) {
    elements.accountGrid.innerHTML = '<div class="empty-state">Select a Metricool brand to load its real connected channels.</div>';
    return;
  }

  if (!project.accounts.length) {
    elements.accountGrid.innerHTML = '<div class="empty-state">This Metricool brand has no supported connected channels yet.</div>';
    return;
  }

  project.accounts.forEach((account) => {
    const card = document.createElement("article");
    card.className = "account-card";

    const head = document.createElement("div");
    head.className = "account-card-head";
    head.appendChild(buildAccountLabel(account));

    const toggle = document.createElement("label");
    toggle.className = "toggle";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(account.metricoolPublishEnabled);
    checkbox.addEventListener("change", (event) => {
      account.metricoolPublishEnabled = event.target.checked;
      ensurePublishSelection(project);
      render();
    });
    const toggleText = document.createElement("span");
    toggleText.textContent = "Use for Metricool publish";
    toggle.append(checkbox, toggleText);
    head.appendChild(toggle);

    const details = document.createElement("div");
    details.className = "field-grid compact-grid";

    const connected = document.createElement("div");
    connected.className = "field";
    connected.innerHTML = `<span>Connected channel</span><p class="static-value">${escapeHtml(getMetricoolChannelLabel(project, account) || "Not connected")}</p>`;

    const network = document.createElement("div");
    network.className = "field";
    network.innerHTML = `<span>Network</span><p class="static-value">${escapeHtml(account.metricoolNetwork || metricoolNetworkByPlatform[account.platform] || "Not mapped")}</p>`;

    const routing = getMetricoolRouting(project, account);
    const routingField = document.createElement("div");
    routingField.className = "field field-wide account-routing-field";
    routingField.innerHTML = `<span>Publish routing</span><p class="account-metricool-status" data-tone="${escapeHtml(routing.tone)}">${escapeHtml(routing.warning ? `${routing.summary} ${routing.warning}` : routing.summary)}</p>`;

    details.append(connected, network, routingField);
    card.append(head, details);
    elements.accountGrid.appendChild(card);
  });
}

function renderSampleAccountOptions(project) {
  elements.sampleAccountInput.textContent = "";

  const projectWideOption = document.createElement("option");
  projectWideOption.value = "";
  projectWideOption.textContent = "Project-wide";
  elements.sampleAccountInput.appendChild(projectWideOption);

  (project?.accounts || []).forEach((account) => {
    const option = document.createElement("option");
    option.value = account.id;
    option.textContent = `${account.platform} / ${getAccountLabelText(account)}`;
    elements.sampleAccountInput.appendChild(option);
  });
}

function renderSamples(project) {
  elements.sampleList.textContent = "";

  if (!project?.samples?.length) {
    elements.sampleList.innerHTML = '<div class="empty-state">No approved references yet. Import a post link to start the library.</div>';
    elements.sampleToggleButton.hidden = true;
    return;
  }

  const expandedLibrary = getSampleLibraryExpanded(project.id);
  const visibleSamples = expandedLibrary ? project.samples : project.samples.slice(0, 5);

  visibleSamples.forEach((sample) => {
    const card = document.createElement("article");
    const safeUrl = getSafeExternalUrl(sample.url);
    const accountLine = sample.accountLabel ? ` • ${escapeHtml(sample.accountLabel)}` : " • Project-wide";
    const sampleBody = sample.body?.trim() ? sample.body : "";
    const collapsible = isSampleCollapsible(sample, sampleBody);
    const isExpanded = !collapsible || getSampleExpanded(sample.id);
    card.className = `sample-card${!isExpanded ? " is-collapsed" : ""}`;

    if (!isExpanded) {
      card.innerHTML = `
        <div class="history-title-row">
          <h4>Reference sample</h4>
          <div class="sample-actions">
            <span class="pill">${escapeHtml(formatGenerationTypeLabel(sample.sampleType || "general"))}</span>
            <span class="pill">${escapeHtml(formatReviewStatus(sample.reviewStatus))}</span>
            <button class="secondary-button small-button sample-open" type="button">Open</button>
            <button class="ghost-button small-button sample-delete" type="button">Delete</button>
          </div>
        </div>
        <div class="sample-meta">${escapeHtml(formatDate(sample.publishedAt))}${accountLine}${safeUrl ? ` • <a href="${escapeHtml(safeUrl)}" target="_blank" rel="noreferrer">source link</a>` : ""}</div>
        <p class="sample-preview">${escapeHtml(buildSamplePreview(sampleBody))}</p>
      `;

      card.querySelector(".sample-open").addEventListener("click", () => {
        setSampleExpanded(sample.id, true);
        renderSamples(project);
      });

      card.querySelector(".sample-delete").addEventListener("click", async (event) => {
        const confirmed = window.confirm("Delete this sample? This cannot be undone.");
        if (!confirmed) {
          return;
        }

        await withButtonState(event.currentTarget, "Deleting...", async () => {
          await deleteSample(sample.id);
        });
      });

      elements.sampleList.appendChild(card);
      return;
    }

    card.innerHTML = `
      <div class="history-title-row">
        <h4>Reference sample</h4>
        <div class="sample-actions">
          <span class="pill">${escapeHtml(formatGenerationTypeLabel(sample.sampleType || "general"))}</span>
          <span class="pill">${escapeHtml(formatReviewStatus(sample.reviewStatus))}</span>
          <span class="pill">${escapeHtml(formatSampleMode(sample.mode))}</span>
          ${collapsible ? '<button class="secondary-button small-button sample-collapse" type="button">Collapse</button>' : ""}
          <button class="ghost-button small-button sample-delete" type="button">Delete</button>
        </div>
      </div>
      <div class="sample-meta">${escapeHtml(formatDate(sample.publishedAt))}${accountLine}${safeUrl ? ` • <a href="${escapeHtml(safeUrl)}" target="_blank" rel="noreferrer">source link</a>` : ""}</div>
      <div class="field-grid compact-grid sample-edit-grid">
        <label class="field">
          <span>Type</span>
          <select class="sample-type-select">
            <option value="general"${sample.sampleType === "general" ? " selected" : ""}>General</option>
            <option value="update"${sample.sampleType === "update" ? " selected" : ""}>Update &amp; events</option>
            <option value="trending"${sample.sampleType === "trending" ? " selected" : ""}>Trending</option>
          </select>
        </label>
        <label class="field field-wide">
          <span>Sample text</span>
          <textarea class="sample-body-input" rows="4" placeholder="Paste or edit the sample text before saving.">${escapeHtml(sampleBody)}</textarea>
        </label>
      </div>
      ${
        !sampleBody.trim()
          ? '<p class="muted-copy sample-note">This sample has no usable text yet. It will not influence generation until you save real post text.</p>'
          : !sample.isUsable
            ? '<p class="muted-copy sample-note">This text is treated as low-quality or boilerplate and will not influence generation until you replace it with a real post example.</p>'
            : sample.reviewStatus !== "accepted"
              ? '<p class="muted-copy sample-note">Saving this sample will approve it for future generation.</p>'
              : '<p class="muted-copy sample-note">Approved samples are eligible for style matching during generation.</p>'
      }
      <div class="sample-actions sample-editor-actions">
        <button class="primary-button small-button sample-save" type="button">Save sample</button>
      </div>
    `;

    const deleteButton = card.querySelector(".sample-delete");
    const collapseButton = card.querySelector(".sample-collapse");
    const saveButton = card.querySelector(".sample-save");
    const typeSelect = card.querySelector(".sample-type-select");
    const bodyInput = card.querySelector(".sample-body-input");

    saveButton.addEventListener("click", async () => {
      await withButtonState(saveButton, "Saving...", async () => {
        const nextBody = bodyInput.value.trim();
        if (!nextBody) {
          throw new Error("Approved samples need usable sample text.");
        }

        setSampleExpanded(sample.id, false);
        await updateSample(sample.id, {
          body: nextBody,
          sampleType: typeSelect.value,
          reviewStatus: "accepted",
        });
      }).catch((error) => {
        setSampleExpanded(sample.id, true);
        window.alert(error.message);
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
        await deleteSample(sample.id);
      });
    });

    elements.sampleList.appendChild(card);
  });

  if (project.samples.length > 5) {
    elements.sampleToggleButton.hidden = false;
    elements.sampleToggleButton.textContent = getSampleLibraryExpanded(project.id)
      ? "Show latest 5 samples"
      : `Show ${project.samples.length - 5} older samples`;
  } else {
    elements.sampleToggleButton.hidden = true;
  }
}

function renderSyncedTargets(project) {
  elements.syncedTargetList.textContent = "";

  const targets = getGenerationTargets(project);
  if (!targets.length) {
    elements.syncedTargetList.innerHTML = '<div class="empty-state">Sync a Metricool brand first. Only synced channels receive generated copy.</div>';
    return;
  }

  targets.forEach((account) => {
    const card = document.createElement("article");
    card.className = "target-chip";
    card.appendChild(buildAccountLabel(account));
    elements.syncedTargetList.appendChild(card);
  });
}

function renderAssetSummary() {
  const rows = [
    ...state.selectedAssets.images.map((file) => `Image • ${file.name} • ${formatFileSize(file.size)}`),
    ...(state.selectedAssets.video ? [`Video • ${state.selectedAssets.video.name} • ${formatFileSize(state.selectedAssets.video.size)}`] : []),
  ];

  if (!rows.length) {
    elements.assetSummary.className = "asset-summary empty-state";
    elements.assetSummary.textContent = "No assets selected yet. Upload one image set or one video before generating.";
    return;
  }

  elements.assetSummary.className = "asset-summary output-card compact-output";
  elements.assetSummary.innerHTML = `
    <h4>Selected assets</h4>
    <p class="output-body">${escapeHtml(rows.join("\n"))}</p>
  `;
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

function buildSignalGroup(title, values = [], limit = 2) {
  const picked = values.filter(Boolean).slice(0, limit);
  if (!picked.length) {
    return "";
  }

  return `
    <div class="signal-group">
      <h5>${escapeHtml(title)}</h5>
      <div class="signal-chip-list">
        ${picked
          .map((value) => `<span class="signal-chip" title="${escapeHtml(value)}">${escapeHtml(truncateText(value, 42))}</span>`)
          .join("")}
      </div>
    </div>
  `;
}

function renderAssetInsights(project) {
  const insights = project?.latestAssetInsights;

  if (!insights) {
    elements.assetInsightsPanel.className = "asset-summary empty-state";
    elements.assetInsightsPanel.textContent =
      "Run a generation to inspect extracted dates, rewards, update items, visible text, and trend clues.";
    return;
  }

  const sections = [
    buildSignalGroup("Key details", insights.keyDetails || []),
    buildSignalGroup("Visible text", insights.visibleText || []),
    buildSignalGroup("Dates", insights.dates || []),
    buildSignalGroup("Rewards", insights.rewards || []),
    buildSignalGroup("Update items", insights.updateItems || []),
    buildSignalGroup("Trend clues", insights.trendClues || []),
  ]
    .filter(Boolean)
    .join("");

  elements.assetInsightsPanel.className = "asset-summary output-card signal-summary-card";
  elements.assetInsightsPanel.innerHTML = `
    <div class="history-title-row">
      <h4>Extracted asset signals</h4>
      ${insights.generationType ? `<span class="pill">${escapeHtml(formatGenerationTypeLabel(insights.generationType))}</span>` : ""}
    </div>
    <p class="output-body">${escapeHtml(truncateText(insights.summary || "No extracted summary available.", 180))}</p>
    ${insights.trendContext?.summary ? `<p class="muted-copy extraction-trend"><strong>Trend context:</strong> ${escapeHtml(truncateText(insights.trendContext.summary, 140))}</p>` : ""}
    ${sections || '<p class="muted-copy">No detailed fields were extracted for the latest run.</p>'}
  `;
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

function buildOutputEntryCard(project, entry) {
  const card = document.createElement("article");
  card.className = "output-card output-entry-card";

  const header = document.createElement("div");
  header.className = "output-entry-head";
  header.appendChild(buildPlatformLabel(entry.platform === "general" ? "General" : entry.platform));

  const status = document.createElement("div");
  status.className = "output-entry-status";
  if (entry.accountLabel) {
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = entry.accountLabel;
    status.appendChild(pill);
  }
  header.appendChild(status);
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
      input.rows = field.key === "body" ? 6 : 3;
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
  copyButton.className = "secondary-button small-button";
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
    saveButton.className = "primary-button small-button";
    saveButton.textContent = "Save";
    saveButton.addEventListener("click", async () => {
      await withButtonState(saveButton, "Saving...", async () => {
        await persistOutputEntry(project.id, entry.id, collectOutputFieldValues(card));
      }).catch((error) => {
        window.alert(error.message);
      });
    });
    actions.appendChild(saveButton);
  }

  card.appendChild(actions);
  return card;
}

function renderOutputPanel(project) {
  elements.outputPanel.textContent = "";

  if (!project) {
    elements.outputPanel.innerHTML = '<div class="empty-state">No project selected.</div>';
    return;
  }

  const outputSet = project.draftOutputs || { entries: [], meta: [] };
  if (!outputSet.entries.length) {
    elements.outputPanel.innerHTML = '<div class="empty-state">No outputs yet. Sync channels, upload assets, then generate.</div>';
    return;
  }

  const summaryCard = document.createElement("article");
  summaryCard.className = "output-card output-summary-card";
  summaryCard.innerHTML = `
    <h4>${escapeHtml(outputSet.heading || "Generated outputs")}</h4>
    <div class="output-meta">${(outputSet.meta || []).map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("")}</div>
  `;
  elements.outputPanel.appendChild(summaryCard);

  outputSet.entries.forEach((entry) => {
    elements.outputPanel.appendChild(buildOutputEntryCard(project, entry));
  });
}

function renderHistory(project) {
  elements.historyList.textContent = "";

  if (!project?.history?.length) {
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
    elements.historyToggleButton.textContent = expanded ? "Show latest 3" : `Show ${project.history.length - 3} older`;
  } else {
    elements.historyToggleButton.hidden = true;
  }
}

function renderPublishJobs(project) {
  elements.publishJobsList.textContent = "";

  if (!project?.publishJobs?.length) {
    elements.publishJobsList.innerHTML = '<div class="empty-state">No publish jobs yet.</div>';
    return;
  }

  project.publishJobs.slice(0, 5).forEach((job) => {
    const card = document.createElement("article");
    card.className = "history-card";
    const pills = [
      `<span class="pill">${escapeHtml(job.platform)}</span>`,
      `<span class="pill">${escapeHtml(job.mode)}</span>`,
      `<span class="pill">${escapeHtml(String(job.status || "").replaceAll("-", " "))}</span>`,
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

function renderPublishComposer(project) {
  elements.publishOutputSelect.textContent = "";
  elements.publishAccountSelect.textContent = "";
  elements.publishTitleInput.value = elements.publishTitleInput.value || "";
  elements.publishScheduleInput.value = elements.publishScheduleInput.value || toDateTimeLocalValue();

  if (!project) {
    elements.publishOutputSelect.disabled = true;
    elements.publishAccountSelect.disabled = true;
    elements.publishNowButton.disabled = true;
    elements.publishScheduleButton.disabled = true;
    elements.publishTargetNote.textContent = "No project selected.";
    return;
  }

  const outputs = getOutputEntries(project);
  const publishableAccounts = getPublishableAccounts(project);
  const outputOptions = outputs.filter((entry) => publishableAccounts.some((account) => account.platform === entry.platform));

  if (!project.metricool?.configured) {
    elements.publishOutputSelect.disabled = true;
    elements.publishAccountSelect.disabled = true;
    elements.publishNowButton.disabled = true;
    elements.publishScheduleButton.disabled = true;
    elements.publishTargetNote.textContent = "Metricool is not configured on the server yet.";
    return;
  }

  if (!project.metricool?.blogId) {
    elements.publishOutputSelect.disabled = true;
    elements.publishAccountSelect.disabled = true;
    elements.publishNowButton.disabled = true;
    elements.publishScheduleButton.disabled = true;
    elements.publishTargetNote.textContent = "Link this project to a Metricool brand before publishing.";
    return;
  }

  if (!outputOptions.length) {
    elements.publishOutputSelect.disabled = true;
    elements.publishAccountSelect.disabled = true;
    elements.publishNowButton.disabled = true;
    elements.publishScheduleButton.disabled = true;
    elements.publishTargetNote.textContent = "Generate channel outputs first, then publish or schedule them here.";
    return;
  }

  ensurePublishSelection(project);
  outputOptions.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent = entry.accountLabel ? `${entry.platform} / ${entry.accountLabel}` : entry.platform;
    elements.publishOutputSelect.appendChild(option);
  });

  elements.publishOutputSelect.value = state.selectedPublishOutputId || outputOptions[0].id || "";
  const selectedOutput = outputOptions.find((entry) => entry.id === elements.publishOutputSelect.value) || outputOptions[0];
  const matchingAccounts = publishableAccounts.filter((account) => account.platform === selectedOutput.platform);

  matchingAccounts.forEach((account) => {
    const routing = getMetricoolRouting(project, account);
    const option = document.createElement("option");
    option.value = account.id;
    option.textContent = `${account.platform} / ${getAccountLabelText(account)} -> ${routing.connectedChannel || "unlinked"}`;
    elements.publishAccountSelect.appendChild(option);
  });

  elements.publishAccountSelect.value = state.selectedPublishAccountId || matchingAccounts[0]?.id || "";
  const selectedAccount = matchingAccounts.find((account) => account.id === elements.publishAccountSelect.value) || matchingAccounts[0];
  const selectedFieldValues = Object.fromEntries((selectedOutput.fields || []).map((field) => [field.key, field.value || ""]));

  if (selectedOutput.platform === "YouTube") {
    elements.publishTitleInput.value = elements.publishTitleInput.value || selectedFieldValues.title || "";
    elements.publishTitleInput.placeholder = "YouTube title";
  } else {
    elements.publishTitleInput.value = "";
    elements.publishTitleInput.placeholder = "Optional. Most channels do not need a separate title.";
  }

  const routing = getMetricoolRouting(project, selectedAccount);
  elements.publishTargetNote.textContent = routing.warning ? `${routing.summary} ${routing.warning}` : routing.summary;
  elements.publishOutputSelect.disabled = false;
  elements.publishAccountSelect.disabled = false;
  elements.publishNowButton.disabled = !selectedOutput || !selectedAccount;
  elements.publishScheduleButton.disabled = !selectedOutput || !selectedAccount;
}

function renderGenerationControls(project) {
  const hasTargets = Boolean(getGenerationTargets(project).length);
  elements.generateButton.disabled =
    state.isGenerating
    || state.isCancellingGeneration
    || !hasSelectedAssets()
    || !hasTargets;
  elements.generateButton.textContent = state.isGenerating ? "Generating..." : "Generate";
  elements.stopGenerateButton.hidden = !state.isGenerating;
  elements.stopGenerateButton.disabled = state.isCancellingGeneration;
  elements.stopGenerateButton.textContent = state.isCancellingGeneration ? "Stopping..." : "Stop";
}

function renderModeHint() {
  elements.generationModeHint.textContent =
    state.generatorMode === "openai"
      ? "Mode: OpenAI-compatible API"
      : state.generatorMode === "gateway"
        ? "Mode: Leihuo Gateway API"
        : "Mode: local fallback";
}

function render() {
  const project = getActiveProject();
  renderProjectSelect();
  renderTabs(Boolean(project));
  renderWorkspaceShell(project);
  renderModeHint();

  if (!project) {
    return;
  }

  renderMetricoolSettings(project);
  renderAccounts(project);
  renderSampleAccountOptions(project);
  renderSamples(project);
  renderSyncedTargets(project);
  renderAssetSummary();
  renderGenerationModes();
  renderAssetInsights(project);
  renderOutputPanel(project);
  renderHistory(project);
  renderPublishComposer(project);
  renderPublishJobs(project);
  renderGenerationControls(project);
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
  showToast("Project saved.");
}

async function addSample() {
  const project = getActiveProject();
  if (!project) {
    return;
  }

  const url = elements.sampleLinkInput.value.trim();
  if (!url) {
    throw new Error("Add a post link to import a sample.");
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
  showToast("Sample imported.");
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
  showToast("Sample saved.");
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
  showToast("Sample deleted.");
}

async function syncMetricoolBrands() {
  const payload = await apiRequest("/api/integrations/metricool/brands");
  applyPayload(payload);
}

async function persistOutputEntry(projectId, outputId, values) {
  const payload = await apiRequest(`/api/projects/${projectId}/outputs/${outputId}`, {
    method: "PUT",
    json: {
      title: values.title,
      body: values.body,
    },
  });

  applyPayload(payload);
  showToast("Draft saved.");
}

async function createPublishJob(projectId, values) {
  const payload = await apiRequest(`/api/projects/${projectId}/publish-jobs`, {
    method: "POST",
    json: values,
  });

  applyPayload(payload);
}

async function createProject() {
  const payload = await apiRequest("/api/projects", {
    method: "POST",
    json: {
      name: "New project",
    },
  });

  state.activeTab = "project";
  applyPayload(payload);
  showToast("Project created.");
}

async function removeProject(projectId) {
  const payload = await apiRequest(`/api/projects/${projectId}`, {
    method: "DELETE",
  });

  applyPayload(payload);
  showToast("Project deleted.");
}

async function generateDrafts() {
  const project = getActiveProject();
  if (!project) {
    return;
  }

  if (!getGenerationTargets(project).length) {
    throw new Error("Sync a Metricool brand with at least one supported channel before generating copy.");
  }

  if (!hasSelectedAssets()) {
    throw new Error("Upload at least one image set or one video first.");
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
  renderGenerationControls(project);

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
    state.activeTab = "outputs";
    applyPayload(payload);
  } catch (error) {
    if (error.name !== "AbortError" && error.message !== "Generation cancelled.") {
      throw error;
    }
  } finally {
    state.isGenerating = false;
    state.isCancellingGeneration = false;
    state.generationAbortController = null;
    renderGenerationControls(project);
  }
}

async function stopGeneration() {
  const project = getActiveProject();
  if (!project || !state.isGenerating) {
    return;
  }

  state.isCancellingGeneration = true;
  renderGenerationControls(project);

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
    renderGenerationControls(project);
  }
}

async function submitPublish(mode) {
  const project = getActiveProject();
  if (!project) {
    return;
  }

  const selectedOutput = getOutputEntries(project).find((entry) => entry.id === elements.publishOutputSelect.value);
  const selectedAccount = getPublishableAccounts(project).find((account) => account.id === elements.publishAccountSelect.value);

  if (!selectedOutput || !selectedAccount) {
    throw new Error("Select one output and one publishable channel first.");
  }

  const bodyField = selectedOutput.fields.find((field) => field.key === "body");
  const titleField = selectedOutput.fields.find((field) => field.key === "title");

  const publishBody = String(bodyField?.value || "").trim();
  const publishTitle = String(elements.publishTitleInput.value || titleField?.value || "").trim();

  if (!publishBody) {
    throw new Error("The selected output has no publishable text yet.");
  }

  await createPublishJob(project.id, {
    outputId: selectedOutput.id,
    accountId: selectedAccount.id,
    mode,
    scheduledAt: mode === "schedule" ? new Date(elements.publishScheduleInput.value).toISOString() : undefined,
    publishTitle,
    publishBody,
  });

  window.alert(mode === "schedule" ? "Queued for scheduled submission to Metricool." : "Submitted to Metricool.");
}

function bindEvents() {
  elements.projectSelect.addEventListener("change", (event) => {
    state.activeProjectId = event.target.value;
    ensurePublishSelection(getActiveProject());
    render();
  });

  elements.newProjectButton.addEventListener("click", async () => {
    await withButtonState(elements.newProjectButton, "Creating...", async () => {
      await createProject();
    }).catch((error) => {
      window.alert(error.message);
    });
  });

  elements.saveProjectButton.addEventListener("click", async () => {
    await withButtonState(elements.saveProjectButton, "Saving...", async () => {
      await saveProjectEdits();
    }).catch((error) => {
      window.alert(error.message);
    });
  });

  elements.deleteProjectButton.addEventListener("click", async () => {
    const project = getActiveProject();
    if (!project) {
      return;
    }

    const confirmed = window.confirm(`Delete project "${project.name}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    await withButtonState(elements.deleteProjectButton, "Deleting...", async () => {
      await removeProject(project.id);
    }).catch((error) => {
      window.alert(error.message);
    });
  });

  elements.syncMetricoolBrandsButton.addEventListener("click", async () => {
    await withButtonState(elements.syncMetricoolBrandsButton, "Syncing...", async () => {
      await syncMetricoolBrands();
    }).catch((error) => {
      window.alert(error.message);
    });
  });

  elements.metricoolBrandSelect.addEventListener("change", (event) => {
    const project = getActiveProject();
    if (!project) {
      return;
    }

    const selectedBrand = state.metricoolBrands.find((brand) => brand.blogId === event.target.value);
    applySelectedMetricoolBrand(project, selectedBrand || null);
    ensurePublishSelection(project);
    render();
  });

  elements.addSampleButton.addEventListener("click", async () => {
    await withButtonState(elements.addSampleButton, "Importing...", async () => {
      await addSample();
    }).catch((error) => {
      window.alert(error.message);
    });
  });

  elements.sampleToggleButton.addEventListener("click", () => {
    const project = getActiveProject();
    if (!project || project.samples.length <= 5) {
      return;
    }

    setSampleLibraryExpanded(project.id, !getSampleLibraryExpanded(project.id));
    renderSamples(project);
  });

  elements.historyToggleButton.addEventListener("click", () => {
    const project = getActiveProject();
    if (!project || project.history.length <= 3) {
      return;
    }

    setHistoryExpanded(project.id, !getHistoryExpanded(project.id));
    renderHistory(project);
  });

  elements.imageUploadInput.addEventListener("change", (event) => {
    state.selectedAssets.images = Array.from(event.target.files || []);
    if (state.selectedAssets.images.length) {
      elements.videoUploadInput.value = "";
      state.selectedAssets.video = null;
    }
    renderAssetSummary();
    renderGenerationControls(getActiveProject());
  });

  elements.videoUploadInput.addEventListener("change", (event) => {
    const files = Array.from(event.target.files || []);
    state.selectedAssets.video = files[0] || null;
    if (state.selectedAssets.video) {
      elements.imageUploadInput.value = "";
      state.selectedAssets.images = [];
    }
    renderAssetSummary();
    renderGenerationControls(getActiveProject());
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

  elements.publishOutputSelect.addEventListener("change", () => {
    state.selectedPublishOutputId = elements.publishOutputSelect.value;
    ensurePublishSelection(getActiveProject());
    renderPublishComposer(getActiveProject());
  });

  elements.publishAccountSelect.addEventListener("change", () => {
    state.selectedPublishAccountId = elements.publishAccountSelect.value;
    renderPublishComposer(getActiveProject());
  });

  elements.publishNowButton.addEventListener("click", async () => {
    await withButtonState(elements.publishNowButton, "Publishing...", async () => {
      await submitPublish("now");
    }).catch((error) => {
      window.alert(error.message);
    });
  });

  elements.publishScheduleButton.addEventListener("click", async () => {
    await withButtonState(elements.publishScheduleButton, "Scheduling...", async () => {
      await submitPublish("schedule");
    }).catch((error) => {
      window.alert(error.message);
    });
  });
}

bindEvents();
render();

loadProjects().catch((error) => {
  window.alert(`Failed to load projects: ${error.message}`);
});
