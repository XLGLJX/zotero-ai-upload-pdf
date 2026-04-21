(function () {
  let initialized = false;

  window.WebAIPDFBridgePrefsInit = () => {
    if (initialized) {
      return;
    }
    initialized = true;
    try {
      Zotero.__addonInstance__.hooks.onPrefsEvent("load", { window });
    } catch (error) {
      Zotero.debug?.(
        `[AI-upload-pdf] Failed to initialize preferences: ${String(error)}`,
      );
      throw error;
    }
  };

  if (document.readyState === "complete") {
    window.WebAIPDFBridgePrefsInit();
    return;
  }

  window.addEventListener("load", () => {
    window.WebAIPDFBridgePrefsInit();
  });
})();
