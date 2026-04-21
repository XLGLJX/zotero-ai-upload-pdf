import { getLocaleID, getString, initLocale } from "./utils/locale";
import { registerPrefsScripts } from "./modules/preferenceScript";
import {
  askCurrentReaderInWebAI,
  askCurrentSelectionInWebAI,
} from "./services/webai";
import {
  createSiteProfile,
  createPromptTemplate,
  deletePromptTemplate,
  deleteSiteProfile,
  ensureProfilePrefs,
  getDefaultPromptTemplateId,
  getFillPromptEnabled,
  getDefaultSiteId,
  getEnabledSiteProfiles,
  getPromptTemplateById,
  getPromptTemplates,
  getSiteProfileById,
  setFillPromptEnabled,
  setDefaultPromptTemplateId,
  setDefaultSiteId,
  updatePromptTemplate,
  updateSiteProfile,
} from "./services/profiles";
import {
  getCurrentReaderItem,
  getCurrentSelectionItem,
} from "./services/paper";
import { createZToolkit } from "./utils/ztoolkit";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();
  ensureProfilePrefs();

  registerPrefsPane();
  registerReaderContextMenu();
  registerReaderSidebarSection();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  // Mark initialized as true to confirm plugin loading status
  // outside of the plugin (e.g. scaffold testing process)
  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();

  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );
  registerItemMenu();
  registerCommandPalette();
}

async function onMainWindowUnload(win: Window): Promise<void> {
  addon.data.dialog?.window?.close?.();
}

function onShutdown(): void {
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
  if (addon.data.webAI?.readerMenuHandler) {
    Zotero.Reader.unregisterEventListener(
      "createViewContextMenu",
      addon.data.webAI.readerMenuHandler,
    );
  }
  // Remove addon object
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

/**
 * This function is just an example of dispatcher for Notify events.
 * Any operations should be placed in a function to keep this funcion clear.
 */
async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  ztoolkit.log("notify", event, type, ids, extraData);
}

/**
 * This function is just an example of dispatcher for Preference UI events.
 * Any operations should be placed in a function to keep this funcion clear.
 * @param type event type
 * @param data event data
 */
async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      registerPrefsScripts(data.window);
      break;
    default:
      return;
  }
}

function onShortcuts(type: string) {
  ztoolkit.log("Shortcut received", type);
}

function onDialogEvents(type: string) {
  ztoolkit.log("Dialog event", type);
}

function registerPrefsPane() {
  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    scripts: [rootURI + "content/preferences-init.js"],
    label: getString("prefs-title"),
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
  });
}

function registerItemMenu() {
  if (addon.data.webAI?.itemMenuRegistered) {
    return;
  }
  ztoolkit.Menu.register("item", {
    tag: "menuitem",
    id: `zotero-itemmenu-${addon.data.config.addonRef}-ask-web-ai`,
    label: getString("menu-ask-web-ai"),
    commandListener: () => {
      void askCurrentSelectionInWebAI().catch((error) =>
        ztoolkit.log("Web AI item menu failed", error),
      );
    },
  });
  addon.data.webAI!.itemMenuRegistered = true;
}

function registerReaderContextMenu() {
  if (addon.data.webAI?.readerMenuRegistered) {
    return;
  }
  const handler = (event: any) => {
    event.append({
      label: getString("reader-menu-ask-web-ai"),
      onCommand() {
        void askCurrentReaderInWebAI().catch((error) =>
          ztoolkit.log("Web AI reader menu failed", error),
        );
      },
    });
  };
  Zotero.Reader.registerEventListener(
    "createViewContextMenu",
    handler,
    addon.data.config.addonID,
  );
  addon.data.webAI!.readerMenuRegistered = true;
  addon.data.webAI!.readerMenuHandler = handler;
}

function registerCommandPalette() {
  if (addon.data.webAI?.promptRegistered) {
    return;
  }
  ztoolkit.Prompt.register([
    {
      name: getString("command-open-pdf"),
      label: addon.data.config.addonName,
      when: () => Boolean(getCurrentSelectionItem() || getCurrentReaderItem()),
      callback(prompt) {
        (prompt as any).exit?.();
        void askCurrentSelectionInWebAI().catch(async (selectionError) => {
          ztoolkit.log("Selection-based Web AI command failed", selectionError);
          try {
            await askCurrentReaderInWebAI();
          } catch (readerError) {
            ztoolkit.log("Reader-based Web AI command failed", readerError);
          }
        });
      },
    },
  ]);
  addon.data.webAI!.promptRegistered = true;
}

function registerReaderSidebarSection() {
  Zotero.ItemPaneManager.registerSection({
    paneID: "webaipdfbridge-reader-actions",
    pluginID: addon.data.config.addonID,
    header: {
      l10nID: getLocaleID("reader-panel-title"),
      icon: `chrome://${addon.data.config.addonRef}/content/icons/section-16.png`,
    },
    sidenav: {
      l10nID: getLocaleID("reader-panel-title"),
      icon: `chrome://${addon.data.config.addonRef}/content/icons/section-20.png`,
    },
    bodyXHTML: `
      <html:div id="webaipdfbridge-reader-panel" style="display:flex;flex-direction:column;gap:8px;padding:8px 0;">
        <html:div id="webaipdfbridge-reader-status" style="color:var(--zotero-text-color-secondary);font-size:12px;"></html:div>
        <html:label for="webaipdfbridge-reader-site">${escapeXML(getString("reader-panel-site-label"))}</html:label>
        <html:select id="webaipdfbridge-reader-site"></html:select>
        <html:label for="webaipdfbridge-reader-site-name">${escapeXML(getString("reader-panel-site-name-label"))}</html:label>
        <html:input type="text" id="webaipdfbridge-reader-site-name" />
        <html:label for="webaipdfbridge-reader-url">${escapeXML(getString("reader-panel-url-label"))}</html:label>
        <html:input type="text" id="webaipdfbridge-reader-url" />
        <html:div style="display:flex;gap:8px;flex-wrap:wrap;">
          <html:button id="webaipdfbridge-reader-save-site">${escapeXML(getString("reader-panel-save-site"))}</html:button>
          <html:button id="webaipdfbridge-reader-delete-site">${escapeXML(getString("reader-panel-delete-site"))}</html:button>
          <html:button id="webaipdfbridge-reader-action">${escapeXML(getString("reader-panel-open-button"))}</html:button>
        </html:div>
        <html:div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <html:input type="checkbox" id="webaipdfbridge-reader-fill-prompt" />
          <html:label for="webaipdfbridge-reader-fill-prompt">${escapeXML(getString("reader-panel-fill-prompt-label"))}</html:label>
        </html:div>
        <html:label for="webaipdfbridge-reader-prompt-template">${escapeXML(getString("reader-panel-prompt-template-label"))}</html:label>
        <html:select id="webaipdfbridge-reader-prompt-template"></html:select>
        <html:label for="webaipdfbridge-reader-prompt-name">${escapeXML(getString("reader-panel-prompt-name-label"))}</html:label>
        <html:input type="text" id="webaipdfbridge-reader-prompt-name" />
        <html:div style="display:flex;gap:8px;flex-wrap:wrap;">
          <html:button id="webaipdfbridge-reader-save-prompt">${escapeXML(getString("reader-panel-save-prompt-template"))}</html:button>
          <html:button id="webaipdfbridge-reader-delete-prompt">${escapeXML(getString("reader-panel-delete-prompt-template"))}</html:button>
          <html:button id="webaipdfbridge-reader-add-prompt">${escapeXML(getString("reader-panel-add-prompt-template"))}</html:button>
        </html:div>
        <html:label for="webaipdfbridge-reader-prompt">${escapeXML(getString("reader-panel-prompt-content-label"))}</html:label>
        <html:textarea id="webaipdfbridge-reader-prompt" rows="6"></html:textarea>
        <html:div style="border-top:1px solid var(--material-border);padding-top:8px;display:flex;flex-direction:column;gap:8px;">
          <html:div style="font-weight:600;">${escapeXML(getString("reader-panel-add-site-title"))}</html:div>
          <html:label for="webaipdfbridge-reader-new-site-name">${escapeXML(getString("reader-panel-new-site-name-label"))}</html:label>
          <html:input type="text" id="webaipdfbridge-reader-new-site-name" />
          <html:label for="webaipdfbridge-reader-new-site-url">${escapeXML(getString("reader-panel-new-site-url-label"))}</html:label>
          <html:input type="text" id="webaipdfbridge-reader-new-site-url" />
          <html:button id="webaipdfbridge-reader-add-site">${escapeXML(getString("reader-panel-add-site-button"))}</html:button>
        </html:div>
      </html:div>
    `,
    onItemChange: ({ tabType, setEnabled }) => {
      setEnabled(tabType === "reader");
      return true;
    },
    onRender: ({ body, item, setSectionSummary }) => {
      renderReaderSidebarBody(body, item);
      setSectionSummary(
        item
          ? getSiteProfileById(getDefaultSiteId())?.name || "Ready"
          : "No item",
      );
    },
  });
}

function renderReaderSidebarBody(body: Element, item?: Zotero.Item) {
  const status = body.querySelector(
    "#webaipdfbridge-reader-status",
  ) as HTMLElement | null;
  const siteSelect = body.querySelector(
    "#webaipdfbridge-reader-site",
  ) as HTMLSelectElement | null;
  const siteNameInput = body.querySelector(
    "#webaipdfbridge-reader-site-name",
  ) as HTMLInputElement | null;
  const urlInput = body.querySelector(
    "#webaipdfbridge-reader-url",
  ) as HTMLInputElement | null;
  const saveSiteButton = body.querySelector(
    "#webaipdfbridge-reader-save-site",
  ) as HTMLButtonElement | null;
  const deleteSiteButton = body.querySelector(
    "#webaipdfbridge-reader-delete-site",
  ) as HTMLButtonElement | null;
  const fillPromptCheckbox = body.querySelector(
    "#webaipdfbridge-reader-fill-prompt",
  ) as HTMLInputElement | null;
  const promptTemplateSelect = body.querySelector(
    "#webaipdfbridge-reader-prompt-template",
  ) as HTMLSelectElement | null;
  const promptNameInput = body.querySelector(
    "#webaipdfbridge-reader-prompt-name",
  ) as HTMLInputElement | null;
  const promptInput = body.querySelector(
    "#webaipdfbridge-reader-prompt",
  ) as HTMLTextAreaElement | null;
  const savePromptButton = body.querySelector(
    "#webaipdfbridge-reader-save-prompt",
  ) as HTMLButtonElement | null;
  const deletePromptButton = body.querySelector(
    "#webaipdfbridge-reader-delete-prompt",
  ) as HTMLButtonElement | null;
  const addPromptButton = body.querySelector(
    "#webaipdfbridge-reader-add-prompt",
  ) as HTMLButtonElement | null;
  const newSiteNameInput = body.querySelector(
    "#webaipdfbridge-reader-new-site-name",
  ) as HTMLInputElement | null;
  const newSiteUrlInput = body.querySelector(
    "#webaipdfbridge-reader-new-site-url",
  ) as HTMLInputElement | null;
  const addSiteButton = body.querySelector(
    "#webaipdfbridge-reader-add-site",
  ) as HTMLButtonElement | null;
  const openButton = body.querySelector(
    "#webaipdfbridge-reader-action",
  ) as HTMLButtonElement | null;
  if (
    !status ||
    !siteSelect ||
    !siteNameInput ||
    !urlInput ||
    !saveSiteButton ||
    !deleteSiteButton ||
    !fillPromptCheckbox ||
    !promptTemplateSelect ||
    !promptNameInput ||
    !promptInput ||
    !savePromptButton ||
    !deletePromptButton ||
    !addPromptButton ||
    !newSiteNameInput ||
    !newSiteUrlInput ||
    !addSiteButton ||
    !openButton
  ) {
    return;
  }

  const profiles = getEnabledSiteProfiles();
  const selectedSiteId = getDefaultSiteId();
  siteSelect.replaceChildren();
  for (const profile of profiles) {
    const option = body.ownerDocument!.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    siteSelect.appendChild(option);
  }
  siteSelect.value =
    profiles.find((profile) => profile.id === selectedSiteId)?.id ||
    profiles[0]?.id ||
    "";

  const selectedProfile = getSiteProfileById(siteSelect.value);
  siteNameInput.value = selectedProfile?.name || "";
  urlInput.value = selectedProfile?.url || "";
  deleteSiteButton.disabled = Boolean(selectedProfile?.isBuiltin);
  fillPromptCheckbox.checked = getFillPromptEnabled();
  renderPromptTemplateOptions(promptTemplateSelect);
  promptTemplateSelect.value = getDefaultPromptTemplateId();
  loadPromptTemplateEditor(
    promptTemplateSelect,
    promptNameInput,
    promptInput,
    deletePromptButton,
  );
  status.textContent = item
    ? `${getString("reader-panel-current-item")}: ${item.getDisplayTitle()}`
    : getString("reader-panel-no-item");

  siteSelect.onchange = () => {
    setDefaultSiteId(siteSelect.value);
    const profile = getSiteProfileById(siteSelect.value);
    siteNameInput.value = profile?.name || "";
    urlInput.value = profile?.url || "";
    deleteSiteButton.disabled = Boolean(profile?.isBuiltin);
    status.textContent = item
      ? `${getString("reader-panel-current-item")}: ${item.getDisplayTitle()}`
      : getString("reader-panel-no-item");
  };

  saveSiteButton.onclick = () => {
    try {
      const updated = updateSiteProfile(siteSelect.value, {
        name: siteNameInput.value,
        url: urlInput.value,
      });
      setDefaultSiteId(updated.id);
      siteNameInput.value = updated.name;
      urlInput.value = updated.url;
      const profilesAfterSave = getEnabledSiteProfiles();
      siteSelect.replaceChildren();
      for (const profile of profilesAfterSave) {
        const option = body.ownerDocument!.createElement("option");
        option.value = profile.id;
        option.textContent = profile.name;
        siteSelect.appendChild(option);
      }
      siteSelect.value = updated.id;
      status.textContent = getString("reader-panel-site-saved");
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : String(error);
    }
  };

  deleteSiteButton.onclick = () => {
    try {
      const selectedId = siteSelect.value;
      const remainingProfiles = deleteSiteProfile(selectedId).filter(
        (profile) => profile.enabled,
      );
      siteSelect.replaceChildren();
      for (const profile of remainingProfiles) {
        const option = body.ownerDocument!.createElement("option");
        option.value = profile.id;
        option.textContent = profile.name;
        siteSelect.appendChild(option);
      }
      const nextProfile = getSiteProfileById(getDefaultSiteId());
      siteSelect.value = nextProfile?.id || remainingProfiles[0]?.id || "";
      siteNameInput.value = nextProfile?.name || "";
      urlInput.value = nextProfile?.url || "";
      deleteSiteButton.disabled = Boolean(nextProfile?.isBuiltin);
      status.textContent = getString("reader-panel-site-deleted");
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : String(error);
    }
  };

  savePromptButton.onclick = () => {
    try {
      setFillPromptEnabled(fillPromptCheckbox.checked);
      const updatedTemplate = updatePromptTemplate(promptTemplateSelect.value, {
        name: promptNameInput.value,
        content: promptInput.value,
      });
      setDefaultPromptTemplateId(updatedTemplate.id);
      renderPromptTemplateOptions(promptTemplateSelect);
      promptTemplateSelect.value = updatedTemplate.id;
      loadPromptTemplateEditor(
        promptTemplateSelect,
        promptNameInput,
        promptInput,
        deletePromptButton,
      );
      status.textContent = getString("reader-panel-prompt-template-saved");
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : String(error);
    }
  };

  promptTemplateSelect.onchange = () => {
    setDefaultPromptTemplateId(promptTemplateSelect.value);
    loadPromptTemplateEditor(
      promptTemplateSelect,
      promptNameInput,
      promptInput,
      deletePromptButton,
    );
  };

  deletePromptButton.onclick = () => {
    try {
      const remaining = deletePromptTemplate(promptTemplateSelect.value);
      renderPromptTemplateOptions(promptTemplateSelect);
      promptTemplateSelect.value =
        getDefaultPromptTemplateId() || remaining[0].id;
      loadPromptTemplateEditor(
        promptTemplateSelect,
        promptNameInput,
        promptInput,
        deletePromptButton,
      );
      status.textContent = getString("reader-panel-prompt-template-deleted");
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : String(error);
    }
  };

  addPromptButton.onclick = () => {
    try {
      const createdTemplate = createPromptTemplate({
        name: promptNameInput.value,
        content: promptInput.value,
      });
      renderPromptTemplateOptions(promptTemplateSelect);
      promptTemplateSelect.value = createdTemplate.id;
      setDefaultPromptTemplateId(createdTemplate.id);
      loadPromptTemplateEditor(
        promptTemplateSelect,
        promptNameInput,
        promptInput,
        deletePromptButton,
      );
      status.textContent = getString("reader-panel-prompt-template-added");
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : String(error);
    }
  };

  addSiteButton.onclick = () => {
    try {
      const created = createSiteProfile({
        name: newSiteNameInput.value,
        url: newSiteUrlInput.value,
        templateProfile: getSiteProfileById(siteSelect.value),
      });
      const profilesAfterAdd = getEnabledSiteProfiles();
      siteSelect.replaceChildren();
      for (const profile of profilesAfterAdd) {
        const option = body.ownerDocument!.createElement("option");
        option.value = profile.id;
        option.textContent = profile.name;
        siteSelect.appendChild(option);
      }
      siteSelect.value = created.id;
      setDefaultSiteId(created.id);
      siteNameInput.value = created.name;
      urlInput.value = created.url;
      newSiteNameInput.value = "";
      newSiteUrlInput.value = "";
      status.textContent = getString("reader-panel-site-added");
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : String(error);
    }
  };

  openButton.onclick = () => {
    try {
      setFillPromptEnabled(fillPromptCheckbox.checked);
      setDefaultPromptTemplateId(promptTemplateSelect.value);
      const updated = updateSiteProfile(siteSelect.value, {
        name: siteNameInput.value,
        url: urlInput.value,
      });
      setDefaultSiteId(updated.id);
      void askCurrentReaderInWebAI(updated.id, {
        promptText: fillPromptCheckbox.checked ? promptInput.value : "",
      }).catch((error) => {
        ztoolkit.log("Web AI reader panel failed", error);
        status.textContent =
          error instanceof Error ? error.message : String(error);
      });
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : String(error);
    }
  };
}

function renderPromptTemplateOptions(select: HTMLSelectElement) {
  select.replaceChildren();
  for (const template of getPromptTemplates()) {
    const option = select.ownerDocument!.createElement("option");
    option.value = template.id;
    option.textContent = template.name;
    select.appendChild(option);
  }
  if (!select.value && select.options.length) {
    select.value = (select.item(0) as HTMLOptionElement).value;
  }
}

function loadPromptTemplateEditor(
  select: HTMLSelectElement,
  nameInput: HTMLInputElement,
  contentInput: HTMLTextAreaElement,
  deleteButton: HTMLButtonElement,
) {
  const template = getPromptTemplateById(select.value);
  nameInput.value = template?.name || "";
  contentInput.value = template?.content || "";
  deleteButton.disabled = getPromptTemplates().length <= 1;
}

function escapeXML(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  onShortcuts,
  onDialogEvents,
};
