"use strict";

const STORAGE_KEY = "reminders";
const SETTINGS_KEY = "settings";
const DEFAULT_SETTINGS = {
  returnToDefaultNewTabWhenDone: true
};
const dismissedIds = new Set();
let reminders = [];
let lastDoneUndo = null;
let extensionSettings = { ...DEFAULT_SETTINGS };

const elements = {
  manageButton: document.getElementById("manageButton"),
  errorBanner: document.getElementById("errorBanner"),
  infoBanner: document.getElementById("infoBanner"),
  undoBanner: document.getElementById("undoBanner"),
  undoText: document.getElementById("undoText"),
  undoButton: document.getElementById("undoButton"),
  primarySection: document.getElementById("primarySection"),
  secondarySection: document.getElementById("secondarySection"),
  noDueSection: document.getElementById("noDueSection"),
  primaryContainer: document.getElementById("primaryContainer"),
  secondaryContainer: document.getElementById("secondaryContainer"),
  allStatusContainer: document.getElementById("allStatusContainer")
};

document.addEventListener("DOMContentLoaded", () => {
  wireEvents();
  initialize().catch((error) => {
    showError(`Failed to initialize reminders: ${error.message}`);
  });
});

function wireEvents() {
  elements.manageButton.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  elements.undoButton.addEventListener("click", async () => {
    if (!lastDoneUndo) {
      return;
    }

    const reminder = reminders.find((item) => item.id === lastDoneUndo.id);
    if (!reminder) {
      clearUndoState();
      return;
    }

    try {
      reminder.lastDoneDate = lastDoneUndo.previous.lastDoneDate;
      reminder.snoozeUntil = lastDoneUndo.previous.snoozeUntil;
      reminder.snoozeTabsRemaining = lastDoneUndo.previous.snoozeTabsRemaining;
      await saveReminders(reminders);
      clearUndoState();
      render();
      showInfo(`Undid done action for "${reminder.title}".`);
    } catch (error) {
      showError(`Undo failed: ${error.message}`);
    }
  });

  document.body.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const action = button.dataset.action;
    const reminderId = button.dataset.id;
    if (!action || !reminderId) {
      return;
    }

    const reminder = reminders.find((item) => item.id === reminderId);
    if (!reminder) {
      return;
    }

    try {
      await handleAction(action, reminder, button);
    } catch (error) {
      showError(`Action failed: ${error.message}`);
    }
  });
}

async function initialize() {
  const loaded = await loadState();
  reminders = loaded.reminders;
  extensionSettings = loaded.settings;
  const today = getTodayLocalYmd();
  const dow = new Date().getDay();
  const shouldReturnToDefaultNtp =
    extensionSettings.returnToDefaultNewTabWhenDone &&
    shouldUseDefaultNewTab(reminders, today, dow);
  let needsSave = false;

  if (loaded.changedReminders || loaded.changedSettings) {
    needsSave = true;
  }

  const decremented = decrementSnoozeTabs(reminders);
  if (decremented) {
    needsSave = true;
  }

  if (needsSave) {
    await saveState(reminders, extensionSettings);
  }

  if (shouldReturnToDefaultNtp) {
    try {
      await openBrowserDefaultNewTab();
      return;
    } catch (error) {
      showInfo(`All streaks are done, but auto-return failed: ${error.message}`);
    }
  }

  if (loaded.issues.length > 0) {
    showInfo(loaded.issues.join(" "));
  } else {
    hideInfo();
  }

  render();
}

async function handleAction(action, reminder, button) {
  if (action === "open") {
    window.location.href = reminder.url;
    return;
  }

  if (action === "open-new") {
    await createTab(reminder.url);
    return;
  }

  if (action === "dismiss") {
    dismissedIds.add(reminder.id);
    render();
    return;
  }

  const now = Date.now();
  const today = getTodayLocalYmd();

  switch (action) {
    case "done":
      lastDoneUndo = {
        id: reminder.id,
        title: reminder.title,
        previous: {
          lastDoneDate: reminder.lastDoneDate,
          snoozeUntil: reminder.snoozeUntil,
          snoozeTabsRemaining: reminder.snoozeTabsRemaining
        }
      };
      reminder.lastDoneDate = today;
      reminder.snoozeUntil = null;
      reminder.snoozeTabsRemaining = null;
      break;
    case "undo-done":
      reminder.lastDoneDate = null;
      if (lastDoneUndo && lastDoneUndo.id === reminder.id) {
        clearUndoState();
      }
      break;
    case "snooze-1h":
      reminder.snoozeUntil = now + 60 * 60 * 1000;
      reminder.snoozeTabsRemaining = null;
      closeSnooze(button);
      break;
    case "snooze-3h":
      reminder.snoozeUntil = now + 3 * 60 * 60 * 1000;
      reminder.snoozeTabsRemaining = null;
      closeSnooze(button);
      break;
    case "snooze-tomorrow":
      reminder.snoozeUntil = getTomorrowAtNineLocal(now);
      reminder.snoozeTabsRemaining = null;
      closeSnooze(button);
      break;
    case "snooze-tabs":
      reminder.snoozeTabsRemaining = 5;
      reminder.snoozeUntil = null;
      closeSnooze(button);
      break;
    default:
      return;
  }

  await saveReminders(reminders);
  render();
  if (action === "done") {
    updateUndoBanner();
  }
}

function closeSnooze(button) {
  const details = button.closest("details");
  if (details) {
    details.open = false;
  }
}

function render() {
  hideError();
  elements.primaryContainer.replaceChildren();
  elements.secondaryContainer.replaceChildren();
  elements.allStatusContainer.replaceChildren();

  const now = Date.now();
  const today = getTodayLocalYmd();
  const dow = new Date().getDay();

  const due = reminders
    .filter((reminder) => !dismissedIds.has(reminder.id) && isDue(reminder, today, now, dow))
    .sort(compareReminders);

  if (due.length === 0) {
    elements.primarySection.classList.add("hidden");
    elements.secondarySection.classList.add("hidden");
    elements.noDueSection.classList.remove("hidden");
    renderAllStatuses(reminders, today, now, dow);
    return;
  }

  elements.primarySection.classList.remove("hidden");
  elements.noDueSection.classList.add("hidden");

  const primary = due[0];
  elements.primaryContainer.appendChild(createReminderCard(primary, true));

  const secondary = due.slice(1);
  if (secondary.length > 0) {
    elements.secondarySection.classList.remove("hidden");
    secondary.forEach((item) => {
      elements.secondaryContainer.appendChild(createReminderCard(item, false));
    });
  } else {
    elements.secondarySection.classList.add("hidden");
  }
}

function createReminderCard(reminder, isPrimary) {
  const card = document.createElement("article");
  card.className = `reminder-card${isPrimary ? " primary" : ""}`;

  const title = document.createElement("h3");
  title.className = "reminder-title";
  title.textContent = reminder.title;

  const link = document.createElement("a");
  link.className = "reminder-link";
  link.href = reminder.url;
  link.textContent = reminder.url;
  link.target = "_blank";
  link.rel = "noreferrer";

  const actionRow = document.createElement("div");
  actionRow.className = "action-row";
  actionRow.append(
    createActionButton("Open", "primary-btn", "open", reminder.id),
    createActionButton("Open in new tab", "secondary-btn", "open-new", reminder.id),
    createActionButton("Done", "secondary-btn", "done", reminder.id),
    createSnoozeMenu(reminder.id),
    createActionButton("Dismiss", "warn-btn", "dismiss", reminder.id)
  );

  card.append(title, link, actionRow);
  return card;
}

function createActionButton(label, className, action, reminderId) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.id = reminderId;
  return button;
}

function createSnoozeMenu(reminderId) {
  const wrapper = document.createElement("details");
  wrapper.className = "snooze";

  const summary = document.createElement("summary");
  summary.className = "secondary-btn";
  summary.textContent = "Snooze";

  const panel = document.createElement("div");
  panel.className = "snooze-panel";

  panel.append(
    createActionButton("1 hour", "snooze-option", "snooze-1h", reminderId),
    createActionButton("3 hours", "snooze-option", "snooze-3h", reminderId),
    createActionButton("Tomorrow 09:00", "snooze-option", "snooze-tomorrow", reminderId),
    createActionButton("Next 5 tabs", "snooze-option", "snooze-tabs", reminderId)
  );

  wrapper.append(summary, panel);
  return wrapper;
}

function renderAllStatuses(items, today, now, dow) {
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "status-item";
    empty.textContent = "No reminders configured yet. Use Manage reminders to add one.";
    elements.allStatusContainer.appendChild(empty);
    return;
  }

  const ordered = [...items].sort(compareReminders);
  ordered.forEach((reminder) => {
    const row = document.createElement("div");
    row.className = "status-item";

    const main = document.createElement("div");
    main.className = "status-main";

    const title = document.createElement("span");
    title.className = "status-title";
    title.textContent = reminder.title;

    const status = document.createElement("span");
    status.className = "status-meta";
    status.textContent = getStatusLabel(reminder, today, now, dow);

    main.append(title);

    const actions = document.createElement("div");
    actions.className = "status-actions";
    actions.append(status);

    if (reminder.lastDoneDate === today) {
      actions.append(createActionButton("Undo done", "secondary-btn", "undo-done", reminder.id));
    }

    row.append(main, actions);
    elements.allStatusContainer.appendChild(row);
  });
}

function getStatusLabel(reminder, today, now, dow) {
  if (!reminder.enabled) {
    return "Disabled";
  }

  if (reminder.lastDoneDate === today) {
    return "Done today";
  }

  if (typeof reminder.snoozeTabsRemaining === "number" && reminder.snoozeTabsRemaining > 0) {
    const tabText = reminder.snoozeTabsRemaining === 1 ? "tab" : "tabs";
    return `Snoozed for ${reminder.snoozeTabsRemaining} ${tabText}`;
  }

  if (typeof reminder.snoozeUntil === "number" && reminder.snoozeUntil > now) {
    return `Snoozed until ${formatDateTime(reminder.snoozeUntil)}`;
  }

  if (reminder.scheduleType === "daysOfWeek" && !reminder.days.includes(dow)) {
    return `Scheduled: ${formatDays(reminder.days)}`;
  }

  return "Due now";
}

function isDue(reminder, today, now, dow) {
  if (reminder.enabled !== true) {
    return false;
  }

  const scheduleMatches = matchesTodaySchedule(reminder, dow);

  if (!scheduleMatches) {
    return false;
  }

  if (reminder.lastDoneDate === today) {
    return false;
  }

  if (typeof reminder.snoozeUntil === "number" && reminder.snoozeUntil > now) {
    return false;
  }

  if (typeof reminder.snoozeTabsRemaining === "number" && reminder.snoozeTabsRemaining > 0) {
    return false;
  }

  return true;
}

function shouldUseDefaultNewTab(items, today, dow) {
  const todaysEnabled = items.filter((item) => item.enabled === true && matchesTodaySchedule(item, dow));
  if (todaysEnabled.length === 0) {
    return false;
  }

  return todaysEnabled.every((item) => item.lastDoneDate === today);
}

function matchesTodaySchedule(reminder, dow) {
  return (
    reminder.scheduleType === "daily" ||
    (reminder.scheduleType === "daysOfWeek" && reminder.days.includes(dow))
  );
}

function decrementSnoozeTabs(items) {
  let changed = false;
  items.forEach((reminder) => {
    if (typeof reminder.snoozeTabsRemaining === "number" && reminder.snoozeTabsRemaining > 0) {
      reminder.snoozeTabsRemaining -= 1;
      changed = true;
    }
  });
  return changed;
}

async function loadState() {
  const raw = await storageGetMany([STORAGE_KEY, SETTINGS_KEY]);
  const reminderState = sanitizeStoredReminders(raw[STORAGE_KEY]);
  const settingsState = sanitizeSettings(raw[SETTINGS_KEY]);
  return {
    reminders: reminderState.reminders,
    settings: settingsState.settings,
    issues: [...reminderState.issues, ...settingsState.issues],
    changedReminders: reminderState.changed,
    changedSettings: settingsState.changed
  };
}

function sanitizeStoredReminders(raw) {
  const issues = [];
  let changed = false;

  if (raw == null) {
    return { reminders: [], issues, changed: false };
  }

  if (!Array.isArray(raw)) {
    return {
      reminders: [],
      issues: ["Storage was corrupted and has been reset to an empty reminders list."],
      changed: true
    };
  }

  const valid = [];

  raw.forEach((candidate, index) => {
    const result = sanitizeReminder(candidate, index);
    if (!result.valid) {
      issues.push(`Dropped invalid reminder at position ${index + 1}.`);
      changed = true;
      return;
    }

    if (result.changed) {
      changed = true;
    }
    valid.push(result.value);
  });

  const hadContiguousRanks = hasContiguousRanks(valid);
  const normalized = normalizeRanks(valid);
  if (!hadContiguousRanks) {
    changed = true;
  }

  return { reminders: normalized, issues, changed };
}

function sanitizeSettings(raw) {
  if (raw == null) {
    return { settings: { ...DEFAULT_SETTINGS }, issues: [], changed: false };
  }

  if (typeof raw !== "object" || Array.isArray(raw)) {
    return {
      settings: { ...DEFAULT_SETTINGS },
      issues: ["Settings were invalid and have been reset to defaults."],
      changed: true
    };
  }

  const returnToDefault =
    typeof raw.returnToDefaultNewTabWhenDone === "boolean"
      ? raw.returnToDefaultNewTabWhenDone
      : DEFAULT_SETTINGS.returnToDefaultNewTabWhenDone;

  const settings = {
    returnToDefaultNewTabWhenDone: returnToDefault
  };

  const changed = raw.returnToDefaultNewTabWhenDone !== settings.returnToDefaultNewTabWhenDone;
  return { settings, issues: [], changed };
}

function sanitizeReminder(raw, index) {
  if (!raw || typeof raw !== "object") {
    return { valid: false, changed: false, value: null };
  }

  let changed = false;

  const url = normalizeUrl(raw.url);
  if (!url) {
    return { valid: false, changed: false, value: null };
  }

  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : crypto.randomUUID();
  changed = changed || id !== raw.id;

  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "Untitled Reminder";
  changed = changed || title !== raw.title;

  const enabled = typeof raw.enabled === "boolean" ? raw.enabled : true;
  changed = changed || enabled !== raw.enabled;

  const rank = Number.isInteger(raw.rank) && raw.rank > 0 ? raw.rank : index + 1;
  changed = changed || rank !== raw.rank;

  const scheduleType = raw.scheduleType === "daily" || raw.scheduleType === "daysOfWeek" ? raw.scheduleType : "daily";
  changed = changed || scheduleType !== raw.scheduleType;

  const normalizedDays = normalizeDays(raw.days);
  changed = changed || !sameNumberArray(raw.days, normalizedDays);

  if (scheduleType === "daysOfWeek" && normalizedDays.length === 0) {
    return { valid: false, changed: false, value: null };
  }

  const lastDoneDate = normalizeYmd(raw.lastDoneDate);
  changed = changed || lastDoneDate !== raw.lastDoneDate;

  const snoozeUntil = normalizeNullableNumber(raw.snoozeUntil, true);
  changed = changed || snoozeUntil !== raw.snoozeUntil;

  const snoozeTabsRemaining = normalizeNullableNumber(raw.snoozeTabsRemaining, false);
  changed = changed || snoozeTabsRemaining !== raw.snoozeTabsRemaining;

  return {
    valid: true,
    changed,
    value: {
      id,
      title,
      url,
      enabled,
      rank,
      scheduleType,
      days: scheduleType === "daysOfWeek" ? normalizedDays : [],
      lastDoneDate,
      snoozeUntil,
      snoozeTabsRemaining
    }
  };
}

function normalizeRanks(items) {
  const sorted = [...items].sort(compareReminders);
  sorted.forEach((item, index) => {
    item.rank = index + 1;
  });
  return sorted;
}

function hasContiguousRanks(items) {
  const expected = [...items].sort(compareReminders);
  return expected.every((item, index) => item.rank === index + 1);
}

function compareReminders(a, b) {
  if (a.rank !== b.rank) {
    return a.rank - b.rank;
  }
  const titleCompare = a.title.localeCompare(b.title);
  if (titleCompare !== 0) {
    return titleCompare;
  }
  return a.id.localeCompare(b.id);
}

function normalizeDays(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return [...new Set(input.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b);
}

function sameNumberArray(a, b) {
  if (!Array.isArray(a) || a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
}

function normalizeNullableNumber(value, allowFloat) {
  if (value == null) {
    return null;
  }

  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    return null;
  }

  if (!allowFloat && !Number.isInteger(value)) {
    return null;
  }

  return value;
}

function normalizeYmd(value) {
  if (value == null) {
    return null;
  }
  if (typeof value !== "string" || !isValidYmd(value)) {
    return null;
  }
  return value;
}

function isValidYmd(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function normalizeUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch (_error) {
    return null;
  }
}

function formatDateTime(epochMs) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(epochMs));
}

function formatDays(days) {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days.map((day) => labels[day]).join(", ");
}

function getTomorrowAtNineLocal(nowMs) {
  const date = new Date(nowMs);
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return date.getTime();
}

function getTodayLocalYmd(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function storageGet(key) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get([key], (result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(result[key]);
    });
  });
}

async function storageGetMany(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(keys, (result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(result);
    });
  });
}

async function saveReminders(nextReminders) {
  await new Promise((resolve, reject) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: nextReminders }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

async function saveState(nextReminders, nextSettings) {
  await new Promise((resolve, reject) => {
    chrome.storage.sync.set(
      {
        [STORAGE_KEY]: nextReminders,
        [SETTINGS_KEY]: nextSettings
      },
      () => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve();
      }
    );
  });
}

async function createTab(url) {
  await new Promise((resolve, reject) => {
    chrome.tabs.create({ url }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

async function openBrowserDefaultNewTab() {
  const candidates = await getNewTabCandidates();
  let lastError = null;

  for (const url of candidates) {
    try {
      await updateCurrentTab(url);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to open browser New Tab page.");
}

async function getNewTabCandidates() {
  const candidates = [];
  if (await isBraveBrowser()) {
    // brave://newtab preserves Brave's configured NTP behavior.
    candidates.push("brave://newtab/", "brave://new-tab-page/");
  }
  candidates.push("chrome://newtab/", "chrome://new-tab-page/");
  return [...new Set(candidates)];
}

async function isBraveBrowser() {
  try {
    if (navigator.brave && typeof navigator.brave.isBrave === "function") {
      return await navigator.brave.isBrave();
    }
  } catch (_error) {
    // Ignore detection failures and fall back to UA checks below.
  }
  return /\bBrave\//i.test(navigator.userAgent);
}

async function updateCurrentTab(url) {
  await new Promise((resolve, reject) => {
    chrome.tabs.update({ url }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

function showError(message) {
  elements.errorBanner.textContent = message;
  elements.errorBanner.classList.remove("hidden");
}

function hideError() {
  elements.errorBanner.classList.add("hidden");
  elements.errorBanner.textContent = "";
}

function showInfo(message) {
  elements.infoBanner.textContent = message;
  elements.infoBanner.classList.remove("hidden");
}

function hideInfo() {
  elements.infoBanner.classList.add("hidden");
  elements.infoBanner.textContent = "";
}

function updateUndoBanner() {
  if (!lastDoneUndo) {
    clearUndoState();
    return;
  }
  elements.undoText.textContent = `Marked "${lastDoneUndo.title}" done.`;
  elements.undoBanner.classList.remove("hidden");
}

function clearUndoState() {
  lastDoneUndo = null;
  elements.undoBanner.classList.add("hidden");
  elements.undoText.textContent = "";
}
