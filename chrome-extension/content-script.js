(() => {
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  if (!hash) {
    return;
  }

  const params = new URLSearchParams(hash);
  const payload = params.get("zotero-webai-task");
  if (!payload) {
    return;
  }

  try {
    const cleanUrl = `${location.origin}${location.pathname}${location.search}`;
    history.replaceState(null, "", cleanUrl);
  } catch (error) {
    console.warn("Failed to clear Zotero bridge hash", error);
  }

  chrome.runtime.sendMessage({
    type: "zotero-webai-task",
    payload,
  });
})();
