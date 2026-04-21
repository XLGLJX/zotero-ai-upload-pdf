import { getPref, setPref } from "../utils/prefs";
import { PromptTemplate, SiteProfile } from "./types";

const DEFAULT_PROMPT_TEMPLATE = `请基于我上传的论文 PDF 回答问题。

请先给我：
1. 这篇论文的主题
2. 核心贡献
3. 研究方法
4. 关键结论
5. 论文可能的局限性

论文信息：
- 标题：{{title}}
- 作者：{{authors}}
- 年份：{{year}}
- 期刊/会议：{{journal}}
- 摘要：{{abstract}}
- 文件名：{{fileName}}

之后请继续围绕这篇论文回答我的后续问题。`;

const DEFAULT_PROMPT_TEMPLATE_ID = "default-paper-qa";
const DEFAULT_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: DEFAULT_PROMPT_TEMPLATE_ID,
    name: "默认论文问答",
    content: DEFAULT_PROMPT_TEMPLATE,
  },
];

const BUILTIN_PROFILES: SiteProfile[] = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    url: "https://chatgpt.com/",
    ready: "main, form",
    optionalNewChatButton:
      'a[href="/"], button[data-testid*="new-chat"], a[data-testid*="new-chat"], button[aria-label*="New chat"], button[aria-label*="新建"]',
    optionalLocalFileMenuItem: "",
    fileInput: 'input[type="file"]',
    promptInput:
      '#prompt-textarea, [role="textbox"], [aria-label*="ChatGPT"], textarea, div[contenteditable="true"], [contenteditable="true"], [contenteditable="plaintext-only"]',
    sendButton:
      'button[data-testid="send-button"], button[aria-label*="Send"], button[aria-label*="发送"]',
    optionalUploadButton:
      'button[aria-label*="Attach"], button[aria-label*="Upload"], button[aria-label*="Add files"], button[aria-label*="添加"], button[aria-label*="上传"], button[aria-label*="添加文件"]',
    enabled: true,
    isBuiltin: true,
  },
  {
    id: "gemini",
    name: "Gemini",
    url: "https://gemini.google.com/app",
    ready: "main, rich-textarea, textarea",
    optionalNewChatButton:
      'a[href="/app"], button[aria-label*="New chat"], button[aria-label*="新建"], button[mattooltip*="New chat"]',
    optionalLocalFileMenuItem:
      'button[data-test-id="local-images-files-uploader-button"], button[aria-label*="上传文件. 文档"], button[aria-label*="上传文件"]',
    fileInput:
      'input[type="file"], input[accept*="pdf"], input[accept*=".pdf"]',
    promptInput:
      'rich-textarea textarea, rich-textarea [contenteditable="true"], textarea, div[contenteditable="true"]',
    sendButton:
      'button[aria-label*="Send"], button[aria-label*="发送"], button.send-button',
    optionalUploadButton:
      'button[aria-label*="打开文件上传菜单"], button[aria-controls="upload-file-menu"], button[data-test-id="hidden-local-file-upload-button"], button.hidden-local-file-upload-button, button:has(mat-icon[fonticon="add_2"]), [role="button"]:has(mat-icon[fonticon="add_2"])',
    enabled: true,
    isBuiltin: true,
  },
  {
    id: "notebooklm",
    name: "NotebookLM",
    url: "https://notebooklm.google.com/",
    ready: "main, body",
    optionalNewChatButton:
      'button[aria-label*="Create"], button[aria-label*="Notebook"], button[aria-label*="新建"], a[href*="/notebook"]',
    optionalLocalFileMenuItem:
      'button[xapscottyuploadertrigger], button.drop-zone-icon-button, button[aria-label*="上传文件"], button[aria-label*="Upload file"], button[aria-label*="Upload"]',
    fileInput:
      'input[type="file"], input[accept*="pdf"], input[accept*=".pdf"]',
    promptInput:
      'textarea, div[contenteditable="true"], [contenteditable="true"], input[type="text"]',
    sendButton:
      'button[aria-label*="Send"], button[aria-label*="发送"], button[type="submit"]',
    optionalUploadButton:
      'button[aria-label*="打开“上传来源”对话框"], button[aria-label*="添加来源"], button[aria-label*="上传来源"], button[aria-label*="Add source"], button[title*="Add source"]',
    enabled: true,
    isBuiltin: true,
  },
];

export function getBuiltinProfiles() {
  return BUILTIN_PROFILES.map((profile) => ({ ...profile }));
}

function getSeedPromptTemplate() {
  return DEFAULT_PROMPT_TEMPLATE;
}

export function ensureProfilePrefs() {
  if (!getPref("siteProfilesJson")) {
    saveSiteProfiles(getBuiltinProfiles());
  }
  if (!getPref("defaultSiteId")) {
    setPref("defaultSiteId", BUILTIN_PROFILES[0].id);
  }
  ensurePromptTemplatePrefs();
}

function ensurePromptTemplatePrefs() {
  const legacyTemplate = getPref("globalPromptTemplate");
  let seededContent =
    String(legacyTemplate || "").trim() || getSeedPromptTemplate();
  if (!getPref("promptTemplatesJson")) {
    const initialContent = seededContent;
    savePromptTemplates([
      {
        id: DEFAULT_PROMPT_TEMPLATE_ID,
        name: DEFAULT_PROMPT_TEMPLATES[0].name,
        content: initialContent,
      },
    ]);
    seededContent = initialContent;
  }
  if (!getPref("defaultPromptTemplateId")) {
    setPref("defaultPromptTemplateId", DEFAULT_PROMPT_TEMPLATE_ID);
  }
  if (!getPref("globalPromptTemplate")) {
    try {
      const templates = normalizePromptTemplates(
        JSON.parse(getPref("promptTemplatesJson")) as PromptTemplate[],
      );
      const defaultTemplateId =
        getPref("defaultPromptTemplateId") || templates[0]?.id;
      const template =
        templates.find((candidate) => candidate.id === defaultTemplateId) ||
        templates[0];
      setLegacyGlobalPromptTemplate(template?.content || seededContent);
    } catch {
      setLegacyGlobalPromptTemplate(seededContent);
    }
  }
}

export function getSiteProfiles(): SiteProfile[] {
  ensureProfilePrefs();
  try {
    const profiles = JSON.parse(getPref("siteProfilesJson")) as SiteProfile[];
    const normalized = normalizeSiteProfiles(profiles);
    return ensureBuiltinProfilesPresent(normalized);
  } catch (error) {
    ztoolkit.log("Failed to parse site profiles, resetting to defaults", error);
    const profiles = getBuiltinProfiles();
    saveSiteProfiles(profiles);
    return profiles;
  }
}

export function saveSiteProfiles(profiles: SiteProfile[]) {
  const normalized = normalizeSiteProfiles(profiles);
  setPref("siteProfilesJson", JSON.stringify(normalized, null, 2));
}

export function getEnabledSiteProfiles() {
  return getSiteProfiles().filter((profile) => profile.enabled);
}

export function getDefaultSiteId() {
  ensureProfilePrefs();
  return getPref("defaultSiteId");
}

export function setDefaultSiteId(siteId: string) {
  setPref("defaultSiteId", siteId);
}

export function getGlobalPromptTemplate() {
  return getDefaultPromptTemplate();
}

export function setGlobalPromptTemplate(template: string) {
  const activeTemplate = getPromptTemplateById(getDefaultPromptTemplateId());
  if (!activeTemplate) {
    return;
  }
  updatePromptTemplate(activeTemplate.id, {
    content: template || DEFAULT_PROMPT_TEMPLATE,
  });
}

export function getChromeAppPath() {
  return (getPref("chromeAppPath") || "/Applications/Google Chrome.app").trim();
}

export function setChromeAppPath(path: string) {
  setPref("chromeAppPath", path.trim());
}

export function getConfirmBeforeSend() {
  return getPref("confirmBeforeSend");
}

export function setConfirmBeforeSend(value: boolean) {
  setPref("confirmBeforeSend", value);
}

export function getFillPromptEnabled() {
  const value = getPref("fillPromptEnabled");
  return value !== false;
}

export function setFillPromptEnabled(value: boolean) {
  setPref("fillPromptEnabled", value);
}

export function getShowUsageHints() {
  return getPref("showUsageHints");
}

export function setShowUsageHints(value: boolean) {
  setPref("showUsageHints", value);
}

export function getPromptTemplates(): PromptTemplate[] {
  ensureProfilePrefs();
  try {
    const templates = JSON.parse(
      getPref("promptTemplatesJson"),
    ) as PromptTemplate[];
    const normalized = normalizePromptTemplates(templates);
    return ensureDefaultPromptTemplatePresent(normalized);
  } catch (error) {
    ztoolkit.log(
      "Failed to parse prompt templates, resetting to defaults",
      error,
    );
    const templates = getDefaultPromptTemplates();
    savePromptTemplates(templates);
    return templates;
  }
}

export function getDefaultPromptTemplates() {
  return DEFAULT_PROMPT_TEMPLATES.map((template) => ({ ...template }));
}

export function savePromptTemplates(templates: PromptTemplate[]) {
  const normalized = normalizePromptTemplates(templates);
  setPref("promptTemplatesJson", JSON.stringify(normalized, null, 2));
  const selectedId = getPref("defaultPromptTemplateId");
  const nextDefaultId =
    normalized.find((template) => template.id === selectedId)?.id ||
    normalized[0].id;
  setPref("defaultPromptTemplateId", nextDefaultId);
  setLegacyGlobalPromptTemplate(
    normalized.find((template) => template.id === nextDefaultId)?.content ||
      normalized[0].content,
  );
}

export function getDefaultPromptTemplateId() {
  ensureProfilePrefs();
  return getPref("defaultPromptTemplateId");
}

export function setDefaultPromptTemplateId(templateId: string) {
  const template =
    getPromptTemplates().find((candidate) => candidate.id === templateId) ||
    getPromptTemplates()[0];
  setPref("defaultPromptTemplateId", template.id);
  setLegacyGlobalPromptTemplate(template.content);
}

export function getPromptTemplateById(templateId?: string) {
  const templates = getPromptTemplates();
  const preferredId = templateId || getDefaultPromptTemplateId();
  return (
    templates.find((template) => template.id === preferredId) || templates[0]
  );
}

export function getDefaultPromptTemplate() {
  return (
    getPromptTemplateById(getDefaultPromptTemplateId())?.content ||
    getSeedPromptTemplate()
  );
}

export function createPromptTemplate(input: {
  id?: string;
  name: string;
  content: string;
}) {
  const templates = getPromptTemplates();
  const baseId =
    String(input.id || input.name || "prompt-template")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "prompt-template";
  let nextId = baseId;
  let suffix = 2;
  while (templates.some((template) => template.id === nextId)) {
    nextId = `${baseId}-${suffix}`;
    suffix += 1;
  }
  const template: PromptTemplate = {
    id: nextId,
    name:
      String(input.name || "").trim() ||
      `Prompt Template ${templates.length + 1}`,
    content: String(input.content || "").trim() || DEFAULT_PROMPT_TEMPLATE,
  };
  const normalized = normalizePromptTemplates([...templates, template]);
  savePromptTemplates(normalized);
  return normalized.find((candidate) => candidate.id === nextId)!;
}

export function updatePromptTemplate(
  templateId: string,
  patch: Partial<PromptTemplate>,
) {
  const templates = getPromptTemplates();
  const index = templates.findIndex((template) => template.id === templateId);
  if (index < 0) {
    throw new Error(`Unknown prompt template: ${templateId}`);
  }
  const nextTemplate: PromptTemplate = {
    ...templates[index],
    name:
      patch.name !== undefined
        ? String(patch.name).trim() || templates[index].name
        : templates[index].name,
    content:
      patch.content !== undefined
        ? String(patch.content).trim() || DEFAULT_PROMPT_TEMPLATE
        : templates[index].content,
  };
  const normalized = normalizePromptTemplates(
    templates.map((template, templateIndex) =>
      templateIndex === index ? nextTemplate : template,
    ),
  );
  savePromptTemplates(normalized);
  return normalized[index];
}

export function deletePromptTemplate(templateId: string) {
  const templates = getPromptTemplates();
  if (templates.length <= 1) {
    throw new Error("At least one prompt template must be kept.");
  }
  const target = templates.find((template) => template.id === templateId);
  if (!target) {
    throw new Error(`Unknown prompt template: ${templateId}`);
  }
  const remaining = normalizePromptTemplates(
    templates.filter((template) => template.id !== templateId),
  );
  savePromptTemplates(remaining);
  return remaining;
}

export function getSiteProfileById(siteId?: string) {
  const profiles = getSiteProfiles();
  const preferredSiteId = siteId || getDefaultSiteId();
  return (
    profiles.find(
      (profile) => profile.id === preferredSiteId && profile.enabled,
    ) ||
    profiles.find((profile) => profile.enabled) ||
    profiles[0]
  );
}

export function updateSiteProfile(
  profileId: string,
  patch: Partial<SiteProfile>,
): SiteProfile {
  const profiles = getSiteProfiles();
  const index = profiles.findIndex((profile) => profile.id === profileId);
  if (index < 0) {
    throw new Error(`Unknown site profile: ${profileId}`);
  }
  const template =
    !profiles[index].isBuiltin &&
    shouldApplyBuiltinTemplate(profiles[index], patch)
      ? getBuiltinTemplateForUrl(
          patch.url !== undefined ? String(patch.url) : profiles[index].url,
        )
      : null;
  const nextProfile: SiteProfile = {
    ...profiles[index],
    ...(template || {}),
    ...patch,
    id: patch.id ? String(patch.id).trim().toLowerCase() : profiles[index].id,
    name: patch.name ? String(patch.name).trim() : profiles[index].name,
    url: patch.url ? String(patch.url).trim() : profiles[index].url,
    ready: patch.ready ? String(patch.ready).trim() : profiles[index].ready,
    optionalNewChatButton:
      patch.optionalNewChatButton !== undefined
        ? String(patch.optionalNewChatButton).trim()
        : profiles[index].optionalNewChatButton,
    optionalLocalFileMenuItem:
      patch.optionalLocalFileMenuItem !== undefined
        ? String(patch.optionalLocalFileMenuItem).trim()
        : profiles[index].optionalLocalFileMenuItem,
    fileInput:
      patch.fileInput !== undefined
        ? String(patch.fileInput).trim()
        : profiles[index].fileInput,
    promptInput:
      patch.promptInput !== undefined
        ? String(patch.promptInput).trim()
        : profiles[index].promptInput,
    sendButton:
      patch.sendButton !== undefined
        ? String(patch.sendButton).trim()
        : profiles[index].sendButton,
    optionalUploadButton:
      patch.optionalUploadButton !== undefined
        ? String(patch.optionalUploadButton).trim()
        : profiles[index].optionalUploadButton,
  };
  const normalized = normalizeSiteProfiles(
    profiles.map((profile, profileIndex) =>
      profileIndex === index ? nextProfile : profile,
    ),
  );
  saveSiteProfiles(normalized);
  return normalized.find((profile) => profile.id === nextProfile.id)!;
}

export function createSiteProfile(input: {
  id?: string;
  name: string;
  url: string;
  templateProfile?: SiteProfile;
}): SiteProfile {
  const profiles = getSiteProfiles();
  const template =
    getBuiltinTemplateForUrl(input.url) ||
    (input.templateProfile
      ? {
          ready: input.templateProfile.ready,
          optionalNewChatButton: input.templateProfile.optionalNewChatButton,
          optionalLocalFileMenuItem:
            input.templateProfile.optionalLocalFileMenuItem,
          fileInput: input.templateProfile.fileInput,
          promptInput: input.templateProfile.promptInput,
          sendButton: input.templateProfile.sendButton,
          optionalUploadButton: input.templateProfile.optionalUploadButton,
        }
      : null);
  const baseId =
    String(input.id || input.name || "custom")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "custom";
  let nextId = baseId;
  let suffix = 2;
  while (profiles.some((profile) => profile.id === nextId)) {
    nextId = `${baseId}-${suffix}`;
    suffix += 1;
  }
  const profile: SiteProfile = {
    ...(template || {
      ready: "main",
      optionalNewChatButton: "",
      optionalLocalFileMenuItem: "",
      fileInput: 'input[type="file"]',
      promptInput:
        'textarea, div[contenteditable="true"], [contenteditable="true"]',
      sendButton:
        'button[type="submit"], button[aria-label*="Send"], button[aria-label*="发送"]',
      optionalUploadButton: "",
    }),
    id: nextId,
    name: String(input.name || "").trim(),
    url: String(input.url || "").trim(),
    enabled: true,
    isBuiltin: false,
  };
  const normalized = normalizeSiteProfiles([...profiles, profile]);
  saveSiteProfiles(normalized);
  return normalized.find((candidate) => candidate.id === nextId)!;
}

export function deleteSiteProfile(profileId: string) {
  const profiles = getSiteProfiles();
  const target = profiles.find((profile) => profile.id === profileId);
  if (!target) {
    throw new Error(`Unknown site profile: ${profileId}`);
  }
  if (target.isBuiltin) {
    throw new Error(
      "Built-in site profiles cannot be deleted. You can edit them instead.",
    );
  }
  const remaining = profiles.filter((profile) => profile.id !== profileId);
  const normalized = normalizeSiteProfiles(remaining);
  saveSiteProfiles(normalized);
  if (getDefaultSiteId() === profileId) {
    setDefaultSiteId(normalized[0].id);
  }
  return normalized;
}

function getBuiltinTemplateForUrl(url: string) {
  try {
    const hostname = new URL(String(url || "").trim()).hostname.toLowerCase();
    const matched = getBuiltinProfiles().find((profile) =>
      matchesBuiltinHostname(profile.id, hostname),
    );
    if (!matched) {
      return null;
    }
    return {
      ready: matched.ready,
      optionalNewChatButton: matched.optionalNewChatButton,
      optionalLocalFileMenuItem: matched.optionalLocalFileMenuItem,
      fileInput: matched.fileInput,
      promptInput: matched.promptInput,
      sendButton: matched.sendButton,
      optionalUploadButton: matched.optionalUploadButton,
    };
  } catch {
    return null;
  }
}

function matchesBuiltinHostname(profileId: string, hostname: string) {
  const aliases = getBuiltinHostAliases(profileId);
  return aliases.some(
    (alias) => hostname === alias || hostname.endsWith(`.${alias}`),
  );
}

function getBuiltinHostAliases(profileId: string) {
  switch (profileId) {
    case "chatgpt":
      return ["chatgpt.com", "chat.openai.com"];
    case "gemini":
      return ["gemini.google.com", "bard.google.com"];
    case "notebooklm":
      return ["notebooklm.google.com"];
    default:
      return [];
  }
}

function shouldApplyBuiltinTemplate(
  currentProfile: SiteProfile,
  patch: Partial<SiteProfile>,
) {
  const targetUrl =
    patch.url !== undefined ? String(patch.url).trim() : currentProfile.url;
  if (!getBuiltinTemplateForUrl(targetUrl)) {
    return false;
  }
  return (
    isGenericSelectorValue(currentProfile.ready, "main") ||
    isGenericSelectorValue(currentProfile.fileInput, 'input[type="file"]') ||
    isGenericSelectorValue(
      currentProfile.promptInput,
      'textarea, div[contenteditable="true"], [contenteditable="true"]',
    ) ||
    isGenericSelectorValue(
      currentProfile.sendButton,
      'button[type="submit"], button[aria-label*="Send"], button[aria-label*="发送"]',
    ) ||
    !String(currentProfile.optionalUploadButton || "").trim()
  );
}

function isGenericSelectorValue(currentValue: string, genericValue: string) {
  return String(currentValue || "").trim() === genericValue;
}

function normalizePromptTemplates(templates: PromptTemplate[]) {
  const seen = new Set<string>();
  const normalized = templates.map((template) => {
    const nextTemplate: PromptTemplate = {
      id: String(template.id || "")
        .trim()
        .toLowerCase(),
      name: String(template.name || "").trim(),
      content: String(template.content || "").trim() || DEFAULT_PROMPT_TEMPLATE,
    };
    if (!nextTemplate.id) {
      throw new Error("Prompt template id is required");
    }
    if (!nextTemplate.name) {
      throw new Error("Prompt template name is required");
    }
    if (seen.has(nextTemplate.id)) {
      throw new Error(`Duplicated prompt template id: ${nextTemplate.id}`);
    }
    seen.add(nextTemplate.id);
    return nextTemplate;
  });
  if (!normalized.length) {
    throw new Error("At least one prompt template is required");
  }
  return normalized;
}

function ensureDefaultPromptTemplatePresent(templates: PromptTemplate[]) {
  if (!templates.length) {
    const defaults = getDefaultPromptTemplates();
    savePromptTemplates(defaults);
    return defaults;
  }
  const defaultTemplateId = getPref("defaultPromptTemplateId");
  if (
    !defaultTemplateId ||
    !templates.some((template) => template.id === defaultTemplateId)
  ) {
    setPref("defaultPromptTemplateId", templates[0].id);
  }
  return templates;
}

function setLegacyGlobalPromptTemplate(template: string) {
  setPref("globalPromptTemplate", template || DEFAULT_PROMPT_TEMPLATE);
}

export function validateSiteProfile(profile: SiteProfile) {
  const requiredKeys: Array<keyof SiteProfile> = [
    "id",
    "name",
    "url",
    "ready",
    "fileInput",
    "promptInput",
    "sendButton",
  ];
  for (const key of requiredKeys) {
    if (!String(profile[key] || "").trim()) {
      throw new Error(`Missing required field: ${key}`);
    }
  }
  if (!/^https?:\/\//i.test(profile.url)) {
    throw new Error("Site URL must start with http:// or https://");
  }
}

export function normalizeSiteProfiles(profiles: SiteProfile[]) {
  const seen = new Set<string>();
  const normalized = profiles.map((profile) => {
    const nextProfile: SiteProfile = {
      id: String(profile.id || "")
        .trim()
        .toLowerCase(),
      name: String(profile.name || "").trim(),
      url: String(profile.url || "").trim(),
      ready: String(profile.ready || "").trim(),
      optionalNewChatButton: String(profile.optionalNewChatButton || "").trim(),
      optionalLocalFileMenuItem: String(
        profile.optionalLocalFileMenuItem || "",
      ).trim(),
      fileInput: String(profile.fileInput || "").trim(),
      promptInput: String(profile.promptInput || "").trim(),
      sendButton: String(profile.sendButton || "").trim(),
      optionalUploadButton: String(profile.optionalUploadButton || "").trim(),
      enabled: profile.enabled !== false,
      isBuiltin: Boolean(profile.isBuiltin),
    };
    validateSiteProfile(nextProfile);
    if (seen.has(nextProfile.id)) {
      throw new Error(`Duplicated site profile id: ${nextProfile.id}`);
    }
    seen.add(nextProfile.id);
    return nextProfile;
  });
  if (!normalized.length) {
    throw new Error("At least one site profile is required");
  }
  return normalized;
}

function ensureBuiltinProfilesPresent(profiles: SiteProfile[]) {
  const builtinProfiles = getBuiltinProfiles();
  const mergedProfiles = normalizeSiteProfiles(
    builtinProfiles.reduce((currentProfiles, builtinProfile) => {
      const existingProfile = currentProfiles.find(
        (profile) => profile.id === builtinProfile.id,
      );
      if (!existingProfile) {
        return [...currentProfiles, builtinProfile];
      }
      const nextProfiles = currentProfiles.map((profile) =>
        profile.id === builtinProfile.id
          ? {
              ...builtinProfile,
              name: profile.name || builtinProfile.name,
              url: profile.url || builtinProfile.url,
              enabled: profile.enabled,
              isBuiltin: true,
            }
          : profile,
      );
      return nextProfiles;
    }, profiles),
  );
  const changed =
    JSON.stringify(mergedProfiles) !==
    JSON.stringify(normalizeSiteProfiles(profiles));
  if (!changed) {
    return profiles;
  }
  saveSiteProfiles(mergedProfiles);
  return mergedProfiles;
}
