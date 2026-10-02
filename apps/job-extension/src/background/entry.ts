// Reset the automatic behavior from earlier extension builds so action clicks reach this listener.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch((error: unknown) => {
  console.error("Could not reset the side panel behavior", error);
});

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId }).catch((error: unknown) => {
    console.error("Could not open the side panel", error);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(`jobContext:${tabId}`).catch((error: unknown) => {
    console.error("Could not clear closed-tab job context", error);
  });
});
