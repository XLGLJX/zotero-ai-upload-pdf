import { config } from "../../package.json";
import {
  createPromptTemplate,
  deleteSiteProfile,
  ensureProfilePrefs,
  getChromeAppPath,
  getConfirmBeforeSend,
  getDefaultSiteId,
  getDefaultPromptTemplateId,
  getPromptTemplateById,
  getPromptTemplates,
  getShowUsageHints,
  getSiteProfiles,
  normalizeSiteProfiles,
  saveSiteProfiles,
  setChromeAppPath,
  setConfirmBeforeSend,
  setDefaultSiteId,
  setDefaultPromptTemplateId,
  setShowUsageHints,
  updatePromptTemplate,
  deletePromptTemplate,
} from "../services/profiles";
import { checkChromeSetup } from "../services/browser";
import { SiteProfile } from "../services/types";

export async function registerPrefsScripts(window: Window) {
  ensureProfilePrefs();
  initializePrefsWindow(window);
}

function initializePrefsWindow(window: Window, attempts = 20) {
  const root = window.document.querySelector(
    `#${config.addonRef}-prefs-root`,
  ) as HTMLElement | null;
  if (!root) {
    if (attempts > 0) {
      window.setTimeout(() => initializePrefsWindow(window, attempts - 1), 50);
    }
    return;
  }
  addon.data.prefs = {
    window,
    profiles: getSiteProfiles(),
    selectedProfileId: getDefaultSiteId(),
    promptTemplates: getPromptTemplates(),
    selectedPromptTemplateId: getDefaultPromptTemplateId(),
  };
  renderPrefsUI();
  bindPrefEvents();
}

function renderPrefsUI() {
  const document = addon.data.prefs?.window.document;
  if (!document || !addon.data.prefs) {
    return;
  }
  addon.data.prefs.profiles = getSiteProfiles();
  addon.data.prefs.selectedProfileId =
    getDefaultSiteId() || addon.data.prefs.profiles[0]?.id || "";
  addon.data.prefs.promptTemplates = getPromptTemplates();
  addon.data.prefs.selectedPromptTemplateId =
    getDefaultPromptTemplateId() ||
    addon.data.prefs.promptTemplates[0]?.id ||
    "";

  const chromeAppPathInput = document.querySelector(
    `#${config.addonRef}-chrome-app-path`,
  ) as HTMLInputElement | null;
  const defaultPromptTemplateSelect = document.querySelector(
    `#${config.addonRef}-default-prompt-template`,
  ) as HTMLSelectElement | null;
  const confirmBeforeSendInput = document.querySelector(
    `#${config.addonRef}-confirm-before-send`,
  ) as HTMLInputElement | null;
  const showUsageHintsInput = document.querySelector(
    `#${config.addonRef}-show-usage-hints`,
  ) as HTMLInputElement | null;
  const defaultSiteSelect = document.querySelector(
    `#${config.addonRef}-default-site`,
  ) as HTMLSelectElement | null;
  if (
    !chromeAppPathInput ||
    !defaultPromptTemplateSelect ||
    !confirmBeforeSendInput ||
    !showUsageHintsInput ||
    !defaultSiteSelect
  ) {
    return;
  }

  chromeAppPathInput.value = getChromeAppPath();
  renderDefaultPromptTemplateOptions();
  defaultPromptTemplateSelect.value = getDefaultPromptTemplateId();
  confirmBeforeSendInput.checked = getConfirmBeforeSend();
  showUsageHintsInput.checked = getShowUsageHints();

  renderDefaultSiteOptions();
  defaultSiteSelect.value = getDefaultSiteId();
  renderPromptTemplateList();
  loadSelectedPromptTemplateIntoForm();
  updateDeletePromptTemplateButtonState();
  renderProfileList();
  loadSelectedProfileIntoForm();
  updateDeleteProfileButtonState();
}

function bindPrefEvents() {
  const document = addon.data.prefs?.window.document;
  const root = document?.querySelector(
    `#${config.addonRef}-prefs-root`,
  ) as HTMLElement | null;
  if (
    !document ||
    !root ||
    root.dataset[`${config.addonRef}Bound`] === "true"
  ) {
    return;
  }
  root.dataset[`${config.addonRef}Bound`] = "true";

  document
    .querySelector(`#${config.addonRef}-prompt-template-list`)
    ?.addEventListener("change", (event: Event) => {
      const list = event.target as HTMLSelectElement;
      addon.data.prefs!.selectedPromptTemplateId = list.value;
      loadSelectedPromptTemplateIntoForm();
      updateDeletePromptTemplateButtonState();
    });

  document
    .querySelector(`#${config.addonRef}-new-prompt-template`)
    ?.addEventListener("click", () => {
      try {
        const createdTemplate = createPromptTemplate({
          name: `Prompt Template ${(addon.data.prefs?.promptTemplates || []).length + 1}`,
          content:
            getPromptTemplateById(getDefaultPromptTemplateId())?.content || "",
        });
        addon.data.prefs!.promptTemplates = getPromptTemplates();
        addon.data.prefs!.selectedPromptTemplateId = createdTemplate.id;
        renderDefaultPromptTemplateOptions();
        renderPromptTemplateList();
        loadSelectedPromptTemplateIntoForm();
        updateDeletePromptTemplateButtonState();
      } catch (error) {
        showAlert(formatError(error), true);
      }
    });

  document
    .querySelector(`#${config.addonRef}-save-prompt-template`)
    ?.addEventListener("click", () => {
      try {
        savePromptTemplateForm();
        showAlert("Prompt template saved.");
      } catch (error) {
        showAlert(formatError(error), true);
      }
    });

  document
    .querySelector(`#${config.addonRef}-delete-prompt-template`)
    ?.addEventListener("click", () => {
      try {
        deleteSelectedPromptTemplate();
        showAlert("Prompt template deleted.");
      } catch (error) {
        showAlert(formatError(error), true);
      }
    });

  document
    .querySelector(`#${config.addonRef}-save-settings`)
    ?.addEventListener("click", () => {
      try {
        saveTopLevelSettings();
        showAlert("Settings saved.");
      } catch (error) {
        showAlert(formatError(error), true);
      }
    });

  document
    .querySelector(`#${config.addonRef}-profile-list`)
    ?.addEventListener("change", (event: Event) => {
      const list = event.target as HTMLSelectElement;
      addon.data.prefs!.selectedProfileId = list.value;
      loadSelectedProfileIntoForm();
      updateDeleteProfileButtonState();
    });

  document
    .querySelector(`#${config.addonRef}-new-profile`)
    ?.addEventListener("click", () => {
      const profiles = addon.data.prefs!.profiles || [];
      const profile = createEmptyProfile(profiles);
      addon.data.prefs!.profiles = [...profiles, profile];
      addon.data.prefs!.selectedProfileId = profile.id;
      renderDefaultSiteOptions();
      renderProfileList();
      loadSelectedProfileIntoForm();
      updateDeleteProfileButtonState();
    });

  document
    .querySelector(`#${config.addonRef}-save-profile`)
    ?.addEventListener("click", () => {
      try {
        saveProfileForm();
        showAlert("Site profile saved.");
      } catch (error) {
        showAlert(formatError(error), true);
      }
    });

  document
    .querySelector(`#${config.addonRef}-delete-profile`)
    ?.addEventListener("click", () => {
      try {
        deleteSelectedProfile();
        showAlert("Site profile deleted.");
      } catch (error) {
        showAlert(formatError(error), true);
      }
    });

  document
    .querySelector(`#${config.addonRef}-test-connection`)
    ?.addEventListener("click", async () => {
      try {
        saveTopLevelSettings();
        const appPath = checkChromeSetup();
        showAlert(
          `Chrome path looks valid:\n${appPath}\n\nThe companion extension still needs to be loaded from the chrome-extension folder in chrome://extensions.`,
        );
      } catch (error) {
        showAlert(formatError(error), true);
      }
    });
}

function renderDefaultSiteOptions() {
  const document = addon.data.prefs?.window.document;
  const profiles = addon.data.prefs?.profiles || [];
  const select = document?.querySelector(
    `#${config.addonRef}-default-site`,
  ) as HTMLSelectElement | null;
  if (!select) {
    return;
  }
  select.replaceChildren();
  for (const profile of profiles.filter((profile) => profile.enabled)) {
    const option = document!.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    select.appendChild(option);
  }
  if (!select.value && select.options.length) {
    select.value = (select.item(0) as HTMLOptionElement).value;
  }
}

function renderDefaultPromptTemplateOptions() {
  const document = addon.data.prefs?.window.document;
  const templates = addon.data.prefs?.promptTemplates || [];
  const select = document?.querySelector(
    `#${config.addonRef}-default-prompt-template`,
  ) as HTMLSelectElement | null;
  if (!select) {
    return;
  }
  select.replaceChildren();
  for (const template of templates) {
    const option = document!.createElement("option");
    option.value = template.id;
    option.textContent = template.name;
    select.appendChild(option);
  }
  if (!select.value && select.options.length) {
    select.value = (select.item(0) as HTMLOptionElement).value;
  }
}

function renderPromptTemplateList() {
  const document = addon.data.prefs?.window.document;
  const list = document?.querySelector(
    `#${config.addonRef}-prompt-template-list`,
  ) as HTMLSelectElement | null;
  if (!list) {
    return;
  }
  list.replaceChildren();
  for (const template of addon.data.prefs?.promptTemplates || []) {
    const option = document!.createElement("option");
    option.value = template.id;
    option.textContent = template.name;
    list.appendChild(option);
  }
  if (addon.data.prefs?.selectedPromptTemplateId) {
    list.value = addon.data.prefs.selectedPromptTemplateId;
  }
  if (!list.value && list.options.length) {
    list.value = (list.item(0) as HTMLOptionElement).value;
    addon.data.prefs!.selectedPromptTemplateId = list.value;
  }
}

function renderProfileList() {
  const document = addon.data.prefs?.window.document;
  const list = document?.querySelector(
    `#${config.addonRef}-profile-list`,
  ) as HTMLSelectElement | null;
  if (!list) {
    return;
  }
  list.replaceChildren();
  for (const profile of addon.data.prefs?.profiles || []) {
    const option = document!.createElement("option");
    option.value = profile.id;
    option.textContent = `${profile.name}${profile.isBuiltin ? " (built-in)" : ""}`;
    list.appendChild(option);
  }
  if (addon.data.prefs?.selectedProfileId) {
    list.value = addon.data.prefs.selectedProfileId;
  }
  if (!list.value && list.options.length) {
    list.value = (list.item(0) as HTMLOptionElement).value;
    addon.data.prefs!.selectedProfileId = list.value;
  }
  updateDeleteProfileButtonState();
}

function loadSelectedProfileIntoForm() {
  const document = addon.data.prefs?.window.document;
  const profile = getSelectedProfile();
  if (!document || !profile) {
    return;
  }
  (
    document.querySelector(`#${config.addonRef}-profile-id`) as HTMLInputElement
  ).value = profile.id;
  (
    document.querySelector(
      `#${config.addonRef}-profile-name`,
    ) as HTMLInputElement
  ).value = profile.name;
  (
    document.querySelector(
      `#${config.addonRef}-profile-url`,
    ) as HTMLInputElement
  ).value = profile.url;
  (
    document.querySelector(
      `#${config.addonRef}-profile-enabled`,
    ) as HTMLInputElement
  ).checked = profile.enabled;
  (
    document.querySelector(
      `#${config.addonRef}-profile-ready`,
    ) as HTMLInputElement
  ).value = profile.ready;
  (
    document.querySelector(
      `#${config.addonRef}-profile-new-chat-button`,
    ) as HTMLInputElement
  ).value = profile.optionalNewChatButton;
  (
    document.querySelector(
      `#${config.addonRef}-profile-local-file-menu-item`,
    ) as HTMLInputElement
  ).value = profile.optionalLocalFileMenuItem;
  (
    document.querySelector(
      `#${config.addonRef}-profile-upload-button`,
    ) as HTMLInputElement
  ).value = profile.optionalUploadButton;
  (
    document.querySelector(
      `#${config.addonRef}-profile-file-input`,
    ) as HTMLInputElement
  ).value = profile.fileInput;
  (
    document.querySelector(
      `#${config.addonRef}-profile-prompt-input`,
    ) as HTMLInputElement
  ).value = profile.promptInput;
  (
    document.querySelector(
      `#${config.addonRef}-profile-send-button`,
    ) as HTMLInputElement
  ).value = profile.sendButton;
  updateDeleteProfileButtonState();
}

function loadSelectedPromptTemplateIntoForm() {
  const document = addon.data.prefs?.window.document;
  const template = getSelectedPromptTemplate();
  if (!document || !template) {
    return;
  }
  (
    document.querySelector(
      `#${config.addonRef}-prompt-template-name`,
    ) as HTMLInputElement
  ).value = template.name;
  (
    document.querySelector(
      `#${config.addonRef}-prompt-template-content`,
    ) as HTMLTextAreaElement
  ).value = template.content;
}

function saveTopLevelSettings() {
  const document = addon.data.prefs?.window.document;
  if (!document) {
    return;
  }
  const selectedSite = (
    document.querySelector(
      `#${config.addonRef}-default-site`,
    ) as HTMLSelectElement
  ).value;
  setDefaultSiteId(selectedSite);
  setChromeAppPath(
    (
      document.querySelector(
        `#${config.addonRef}-chrome-app-path`,
      ) as HTMLInputElement
    ).value,
  );
  setDefaultPromptTemplateId(
    (
      document.querySelector(
        `#${config.addonRef}-default-prompt-template`,
      ) as HTMLSelectElement
    ).value,
  );
  setConfirmBeforeSend(
    (
      document.querySelector(
        `#${config.addonRef}-confirm-before-send`,
      ) as HTMLInputElement
    ).checked,
  );
  setShowUsageHints(
    (
      document.querySelector(
        `#${config.addonRef}-show-usage-hints`,
      ) as HTMLInputElement
    ).checked,
  );
}

function savePromptTemplateForm() {
  const selectedTemplate = getSelectedPromptTemplate();
  if (!selectedTemplate) {
    throw new Error("No prompt template is selected.");
  }
  const updatedTemplate = updatePromptTemplate(selectedTemplate.id, {
    name: (
      addon.data.prefs?.window.document.querySelector(
        `#${config.addonRef}-prompt-template-name`,
      ) as HTMLInputElement
    ).value,
    content: (
      addon.data.prefs?.window.document.querySelector(
        `#${config.addonRef}-prompt-template-content`,
      ) as HTMLTextAreaElement
    ).value,
  });
  addon.data.prefs!.promptTemplates = getPromptTemplates();
  addon.data.prefs!.selectedPromptTemplateId = updatedTemplate.id;
  renderDefaultPromptTemplateOptions();
  renderPromptTemplateList();
  loadSelectedPromptTemplateIntoForm();
  saveTopLevelSettings();
}

function saveProfileForm() {
  const draftProfiles = [...(addon.data.prefs?.profiles || [])];
  const nextProfile = readProfileForm();
  const existingIndex = draftProfiles.findIndex(
    (profile) => profile.id === addon.data.prefs?.selectedProfileId,
  );
  if (existingIndex >= 0) {
    draftProfiles[existingIndex] = {
      ...draftProfiles[existingIndex],
      ...nextProfile,
      isBuiltin: draftProfiles[existingIndex].isBuiltin,
    };
  } else {
    draftProfiles.push(nextProfile);
  }
  const normalized = normalizeSiteProfiles(draftProfiles);
  saveSiteProfiles(normalized);
  addon.data.prefs!.profiles = normalized;
  addon.data.prefs!.selectedProfileId = nextProfile.id;
  renderDefaultSiteOptions();
  renderProfileList();
  loadSelectedProfileIntoForm();
  saveTopLevelSettings();
}

function deleteSelectedProfile() {
  const selectedProfile = getSelectedProfile();
  if (!selectedProfile) {
    throw new Error("No site profile is selected.");
  }
  const normalized = deleteSiteProfile(selectedProfile.id);
  addon.data.prefs!.profiles = normalized;
  addon.data.prefs!.selectedProfileId = normalized[0].id;
  renderPrefsUI();
}

function deleteSelectedPromptTemplate() {
  const selectedTemplate = getSelectedPromptTemplate();
  if (!selectedTemplate) {
    throw new Error("No prompt template is selected.");
  }
  const normalized = deletePromptTemplate(selectedTemplate.id);
  addon.data.prefs!.promptTemplates = normalized;
  addon.data.prefs!.selectedPromptTemplateId = getDefaultPromptTemplateId();
  renderDefaultPromptTemplateOptions();
  renderPromptTemplateList();
  loadSelectedPromptTemplateIntoForm();
  updateDeletePromptTemplateButtonState();
}

function updateDeleteProfileButtonState() {
  const document = addon.data.prefs?.window.document;
  const button = document?.querySelector(
    `#${config.addonRef}-delete-profile`,
  ) as HTMLButtonElement | null;
  const selectedProfile = getSelectedProfile();
  if (!button) {
    return;
  }
  button.disabled = !selectedProfile || Boolean(selectedProfile.isBuiltin);
}

function updateDeletePromptTemplateButtonState() {
  const document = addon.data.prefs?.window.document;
  const button = document?.querySelector(
    `#${config.addonRef}-delete-prompt-template`,
  ) as HTMLButtonElement | null;
  if (!button) {
    return;
  }
  button.disabled = (addon.data.prefs?.promptTemplates || []).length <= 1;
}

function readProfileForm(): SiteProfile {
  const document = addon.data.prefs?.window.document;
  if (!document) {
    throw new Error("Preferences window is not available.");
  }
  const existingProfile = getSelectedProfile();
  return {
    id: (
      document.querySelector(
        `#${config.addonRef}-profile-id`,
      ) as HTMLInputElement
    ).value
      .trim()
      .toLowerCase(),
    name: (
      document.querySelector(
        `#${config.addonRef}-profile-name`,
      ) as HTMLInputElement
    ).value.trim(),
    url: (
      document.querySelector(
        `#${config.addonRef}-profile-url`,
      ) as HTMLInputElement
    ).value.trim(),
    enabled: (
      document.querySelector(
        `#${config.addonRef}-profile-enabled`,
      ) as HTMLInputElement
    ).checked,
    ready: (
      document.querySelector(
        `#${config.addonRef}-profile-ready`,
      ) as HTMLInputElement
    ).value.trim(),
    optionalNewChatButton: (
      document.querySelector(
        `#${config.addonRef}-profile-new-chat-button`,
      ) as HTMLInputElement
    ).value.trim(),
    optionalLocalFileMenuItem: (
      document.querySelector(
        `#${config.addonRef}-profile-local-file-menu-item`,
      ) as HTMLInputElement
    ).value.trim(),
    optionalUploadButton: (
      document.querySelector(
        `#${config.addonRef}-profile-upload-button`,
      ) as HTMLInputElement
    ).value.trim(),
    fileInput: (
      document.querySelector(
        `#${config.addonRef}-profile-file-input`,
      ) as HTMLInputElement
    ).value.trim(),
    promptInput: (
      document.querySelector(
        `#${config.addonRef}-profile-prompt-input`,
      ) as HTMLInputElement
    ).value.trim(),
    sendButton: (
      document.querySelector(
        `#${config.addonRef}-profile-send-button`,
      ) as HTMLInputElement
    ).value.trim(),
    isBuiltin: Boolean(existingProfile?.isBuiltin),
  };
}

function getSelectedProfile() {
  const profiles = addon.data.prefs?.profiles || [];
  return profiles.find(
    (profile) => profile.id === addon.data.prefs?.selectedProfileId,
  );
}

function getSelectedPromptTemplate() {
  const templates = addon.data.prefs?.promptTemplates || [];
  return templates.find(
    (template) => template.id === addon.data.prefs?.selectedPromptTemplateId,
  );
}

function createEmptyProfile(profiles: SiteProfile[]) {
  let index = profiles.length + 1;
  let id = `custom-${index}`;
  while (profiles.some((profile) => profile.id === id)) {
    index += 1;
    id = `custom-${index}`;
  }
  return {
    id,
    name: `Custom Site ${index}`,
    url: "https://example.com/",
    ready: "main",
    optionalNewChatButton: "",
    optionalLocalFileMenuItem: "",
    optionalUploadButton: "",
    fileInput: 'input[type="file"]',
    promptInput: 'textarea, div[contenteditable="true"]',
    sendButton: 'button[type="submit"], button[aria-label*="Send"]',
    enabled: true,
    isBuiltin: false,
  } satisfies SiteProfile;
}

function showAlert(message: string, isError = false) {
  const title = isError
    ? `${addon.data.config.addonName} Error`
    : addon.data.config.addonName;
  Zotero.alert(
    addon.data.prefs?.window || Zotero.getMainWindow(),
    title,
    message,
  );
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
