"use strict";

const STORAGE_KEY = "reminders";
let reminders = [];
let selectedId = null;

const elements = {
  messageBanner: document.getElementById("messageBanner"),
  warningBanner: document.getElementById("warningBanner"),
  newReminderButton: document.getElementById("newReminderButton"),
  templateDuolingo: document.getElementById("templateDuolingo"),
  templateLeetCode: document.getElementById("templateLeetCode"),
  templateGmail: document.getElementById("templateGmail"),
  reminderList: document.getElementById("reminderList"),
  emptyList: document.getElementById("emptyList"),
  reminderForm: document.getElementById("reminderForm"),
  formTitle: document.getElementById("formTitle"),
  reminderId: document.getElementById("reminderId"),
  titleInput: document.getElementById("titleInput"),
  urlInput: document.getElementById("urlInput"),
  enabledInput: document.getElementById("enabledInput"),
  scheduleTypeInput: document.getElementById("scheduleTypeInput"),
  daysFieldset: document.getElementById("daysFieldset"),
  formError: document.getElementById("formError"),
  resetFormButton: document.getElementById("resetFormButton"),
  exportButton: document.getElementById("exportButton"),
  importInput: document.getElementById("importInput"),
  importButton: document.getElementById("importButton")
};

document.addEventListener("DOMContentLoaded", () => {
  wireEvents();
  initialize().catch((error) => {
    showWarning(`Failed to load settings: ${error.message}`);
  });
});

function wireEvents() {
  elements.newReminderButton.addEventListener("click", () => {
    selectedId = null;
    fillFormForNewReminder();
  });

  elements.templateDuolingo.addEventListener("click", async () => {
    await createTemplateReminder("duolingo");
  });

  elements.templateLeetCode.addEventListener("click", async () => {
    await createTemplateReminder("leetcode");
  });

  elements.templateGmail.addEventListener("click", async () => {
    await createTemplateReminder("gmail");
  });

  elements.scheduleTypeInput.addEventListener("change", updateDaysVisibility);

  elements.resetFormButton.addEventListener("click", () => {
    if (selectedId) {
      const existing = reminders.find((item) => item.id === selectedId);
      if (existing) {
        fillForm(existing);
        return;
      }
    }
    fillFormForNewReminder();
  });

  elements.reminderForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormError();

    const parsed = parseReminderFromForm();
    if (!parsed.valid) {
      showFormError(parsed.error);
      return;
    }

    const data = parsed.value;
    const isEditing = !!selectedId;

    if (isEditing) {
      const index = reminders.findIndex((item) => item.id === selectedId);
      if (index === -1) {
        showFormError("Cannot edit reminder because it no longer exists.");
        return;
      }

      reminders[index] = {
        ...reminders[index],
        title: data.title,
        url: data.url,
        enabled: data.enabled,
        scheduleType: data.scheduleType,
        days: data.scheduleType === "daysOfWeek" ? data.days : []
      };
    } else {
      reminders.push({
        id: crypto.randomUUID(),
        title: data.title,
        url: data.url,
        enabled: data.enabled,
        rank: reminders.length + 1,
        scheduleType: data.scheduleType,
        days: data.scheduleType === "daysOfWeek" ? data.days : [],
        lastDoneDate: null,
        snoozeUntil: null,
        snoozeTabsRemaining: null
      });
    }

    reminders = normalizeRanks(reminders);
    await saveReminders(reminders);

    renderReminderList();
    if (isEditing) {
      selectReminder(selectedId);
      showMessage("Reminder updated.");
    } else {
      const newest = reminders[reminders.length - 1];
      if (newest) {
        selectReminder(newest.id);
      }
      showMessage("Reminder created.");
    }
  });

  elements.reminderList.addEventListener("click", async (event) => {
    const actionElement = event.target.closest("[data-action]");
    if (!actionElement) {
      const row = event.target.closest(".reminder-row");
      if (row?.dataset.id) {
        selectReminder(row.dataset.id);
      }
      return;
    }

    const action = actionElement.dataset.action;
    const id = actionElement.dataset.id;
    if (!action || !id) {
      return;
    }

    switch (action) {
      case "edit":
        selectReminder(id);
        break;
      case "delete":
        await deleteReminder(id);
        break;
      case "up":
        await moveReminder(id, -1);
        break;
      case "down":
        await moveReminder(id, 1);
        break;
      case "undo-done":
        await undoDoneReminder(id);
        break;
      default:
        break;
    }
  });

  elements.reminderList.addEventListener("change", async (event) => {
    const checkbox = event.target.closest("input[data-action='toggle-enabled']");
    if (!checkbox) {
      return;
    }

    const id = checkbox.dataset.id;
    if (!id) {
      return;
    }

    const reminder = reminders.find((item) => item.id === id);
    if (!reminder) {
      return;
    }

    reminder.enabled = checkbox.checked;
    await saveReminders(reminders);
    renderReminderList();
    if (selectedId === id) {
      fillForm(reminder);
    }
    showMessage(`Reminder ${checkbox.checked ? "enabled" : "disabled"}.`);
  });

  elements.exportButton.addEventListener("click", exportReminders);

  elements.importButton.addEventListener("click", async () => {
    const file = elements.importInput.files?.[0];
    if (!file) {
      showWarning("Select a JSON file before importing.");
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const imported = validateImportPayload(parsed);

      reminders = normalizeRanks(imported);
      selectedId = null;
      await saveReminders(reminders);

      renderReminderList();
      if (reminders.length > 0) {
        selectReminder(reminders[0].id);
      } else {
        fillFormForNewReminder();
      }
      showMessage(`Imported ${reminders.length} reminder(s).`);
      elements.importInput.value = "";
    } catch (error) {
      showWarning(`Import failed: ${error.message}`);
    }
  });
}

async function initialize() {
  const loaded = await loadRemindersForSettings();
  reminders = loaded.reminders;
  renderReminderList();

  if (loaded.issues.length > 0) {
    showWarning(loaded.issues.join(" "));
  }

  if (reminders.length > 0) {
    selectReminder(reminders[0].id);
  } else {
    fillFormForNewReminder();
  }
}

function renderReminderList() {
  elements.reminderList.replaceChildren();
  const today = getTodayLocalYmd();

  const ordered = [...reminders].sort(compareReminders);
  if (ordered.length === 0) {
    elements.emptyList.classList.remove("hidden");
    return;
  }
  elements.emptyList.classList.add("hidden");

  ordered.forEach((reminder, index) => {
    const row = document.createElement("div");
    row.className = `reminder-row${selectedId === reminder.id ? " active" : ""}`;
    row.dataset.id = reminder.id;

    const main = document.createElement("div");
    main.className = "row-main";

    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "row-title";
    title.textContent = `${reminder.rank}. ${reminder.title}`;

    const subtitle = document.createElement("div");
    subtitle.className = "row-subtitle";
    subtitle.textContent = `${reminder.scheduleType === "daily" ? "Daily" : `Days: ${formatDays(reminder.days)}`} · ${reminder.url}`;

    left.append(title, subtitle);

    const enabled = document.createElement("label");
    enabled.className = "inline-field";
    const enabledInput = document.createElement("input");
    enabledInput.type = "checkbox";
    enabledInput.checked = reminder.enabled;
    enabledInput.dataset.id = reminder.id;
    enabledInput.dataset.action = "toggle-enabled";

    const enabledText = document.createElement("span");
    enabledText.textContent = "Enabled";
    enabled.append(enabledInput, enabledText);

    main.append(left, enabled);

    const actions = document.createElement("div");
    actions.className = "row-actions";
    actions.append(
      createListButton("Edit", "edit", reminder.id),
      createListButton("Up", "up", reminder.id, index === 0),
      createListButton("Down", "down", reminder.id, index === ordered.length - 1),
      createListButton("Delete", "delete", reminder.id)
    );
    if (reminder.lastDoneDate === today) {
      actions.append(createListButton("Undo done", "undo-done", reminder.id));
    }

    row.append(main, actions);
    elements.reminderList.appendChild(row);
  });
}

function createListButton(label, action, id, disabled = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.id = id;
  button.disabled = disabled;
  return button;
}

function selectReminder(id) {
  const reminder = reminders.find((item) => item.id === id);
  if (!reminder) {
    return;
  }

  selectedId = id;
  fillForm(reminder);
  renderReminderList();
}

function fillForm(reminder) {
  elements.formTitle.textContent = "Edit reminder";
  elements.reminderId.value = reminder.id;
  elements.titleInput.value = reminder.title;
  elements.urlInput.value = reminder.url;
  elements.enabledInput.checked = reminder.enabled;
  elements.scheduleTypeInput.value = reminder.scheduleType;

  const dayChecks = getDayCheckboxes();
  dayChecks.forEach((checkbox) => {
    checkbox.checked = reminder.days.includes(Number(checkbox.value));
  });

  updateDaysVisibility();
  clearFormError();
}

function fillFormForNewReminder() {
  selectedId = null;
  elements.formTitle.textContent = "New reminder";
  elements.reminderId.value = "";
  elements.titleInput.value = "";
  elements.urlInput.value = "";
  elements.enabledInput.checked = true;
  elements.scheduleTypeInput.value = "daily";

  getDayCheckboxes().forEach((checkbox) => {
    checkbox.checked = false;
  });

  updateDaysVisibility();
  clearFormError();
}

function parseReminderFromForm() {
  const title = elements.titleInput.value.trim();
  const url = normalizeUrl(elements.urlInput.value.trim());
  const scheduleType = elements.scheduleTypeInput.value;
  const enabled = elements.enabledInput.checked;

  if (!title) {
    return { valid: false, error: "Title is required." };
  }

  if (!url) {
    return { valid: false, error: "URL must be a valid http/https address." };
  }

  if (scheduleType !== "daily" && scheduleType !== "daysOfWeek") {
    return { valid: false, error: "Schedule type is invalid." };
  }

  const days = normalizeDays(getSelectedDays());
  if (scheduleType === "daysOfWeek" && days.length === 0) {
    return { valid: false, error: "Choose at least one day for a days-of-week schedule." };
  }

  return {
    valid: true,
    value: {
      title,
      url,
      enabled,
      scheduleType,
      days
    }
  };
}

function getSelectedDays() {
  return getDayCheckboxes()
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => Number(checkbox.value));
}

function getDayCheckboxes() {
  return [...elements.daysFieldset.querySelectorAll("input[type='checkbox']")];
}

function updateDaysVisibility() {
  const isDays = elements.scheduleTypeInput.value === "daysOfWeek";
  elements.daysFieldset.classList.toggle("hidden", !isDays);
}

async function deleteReminder(id) {
  reminders = reminders.filter((item) => item.id !== id);
  reminders = normalizeRanks(reminders);

  if (selectedId === id) {
    selectedId = null;
  }

  await saveReminders(reminders);
  renderReminderList();

  if (selectedId) {
    selectReminder(selectedId);
  } else if (reminders.length > 0) {
    selectReminder(reminders[0].id);
  } else {
    fillFormForNewReminder();
  }

  showMessage("Reminder deleted.");
}

async function moveReminder(id, direction) {
  const ordered = [...reminders].sort(compareReminders);
  const index = ordered.findIndex((item) => item.id === id);
  if (index === -1) {
    return;
  }

  const swapIndex = index + direction;
  if (swapIndex < 0 || swapIndex >= ordered.length) {
    return;
  }

  const current = ordered[index];
  ordered[index] = ordered[swapIndex];
  ordered[swapIndex] = current;

  ordered.forEach((item, idx) => {
    item.rank = idx + 1;
  });

  reminders = ordered;
  await saveReminders(reminders);
  renderReminderList();
  showMessage("Reminder order updated.");
}

async function undoDoneReminder(id) {
  const reminder = reminders.find((item) => item.id === id);
  if (!reminder) {
    return;
  }

  reminder.lastDoneDate = null;
  await saveReminders(reminders);
  renderReminderList();
  if (selectedId === id) {
    fillForm(reminder);
  }
  showMessage(`Done status cleared for "${reminder.title}".`);
}

async function createTemplateReminder(templateName) {
  const template = getTemplate(templateName);
  reminders.push(template);
  reminders = normalizeRanks(reminders);

  try {
    await saveReminders(reminders);
    renderReminderList();
    selectReminder(template.id);
    showMessage(`Template added: ${template.title}`);
  } catch (error) {
    showWarning(`Failed to add template: ${error.message}`);
  }
}

function getTemplate(name) {
  const base = {
    id: crypto.randomUUID(),
    enabled: true,
    lastDoneDate: null,
    snoozeUntil: null,
    snoozeTabsRemaining: null,
    rank: reminders.length + 1
  };

  if (name === "duolingo") {
    return {
      ...base,
      title: "Duolingo",
      url: "https://www.duolingo.com/",
      scheduleType: "daily",
      days: []
    };
  }

  if (name === "leetcode") {
    return {
      ...base,
      title: "LeetCode",
      url: "https://leetcode.com/",
      scheduleType: "daily",
      days: []
    };
  }

  return {
    ...base,
    title: "Gmail",
    url: "https://mail.google.com/",
    scheduleType: "daysOfWeek",
    days: [1, 2, 3, 4, 5]
  };
}

function exportReminders() {
  try {
    const payload = JSON.stringify([...reminders].sort(compareReminders), null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "streak-reminders-export.json";
    link.click();

    URL.revokeObjectURL(url);
    showMessage(`Exported ${reminders.length} reminder(s).`);
  } catch (error) {
    showWarning(`Export failed: ${error.message}`);
  }
}

function validateImportPayload(payload) {
  if (!Array.isArray(payload)) {
    throw new Error("Import file must be an array of reminders.");
  }

  const imported = payload.map((entry, index) => validateImportedReminder(entry, index));
  const ids = new Set();
  imported.forEach((item, index) => {
    if (ids.has(item.id)) {
      throw new Error(`Reminder ${index + 1}: duplicate id '${item.id}'.`);
    }
    ids.add(item.id);
  });
  return imported;
}

function validateImportedReminder(raw, index) {
  const requiredFields = [
    "id",
    "title",
    "url",
    "enabled",
    "rank",
    "scheduleType",
    "days",
    "lastDoneDate",
    "snoozeUntil",
    "snoozeTabsRemaining"
  ];

  if (!raw || typeof raw !== "object") {
    throw new Error(`Reminder ${index + 1}: must be an object.`);
  }

  for (const field of requiredFields) {
    if (!Object.prototype.hasOwnProperty.call(raw, field)) {
      throw new Error(`Reminder ${index + 1}: missing required field '${field}'.`);
    }
  }

  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : null;
  if (!id) {
    throw new Error(`Reminder ${index + 1}: id must be a non-empty string.`);
  }

  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : null;
  if (!title) {
    throw new Error(`Reminder ${index + 1}: title must be a non-empty string.`);
  }

  const url = normalizeUrl(raw.url);
  if (!url) {
    throw new Error(`Reminder ${index + 1}: url must be valid http/https.`);
  }

  if (typeof raw.enabled !== "boolean") {
    throw new Error(`Reminder ${index + 1}: enabled must be boolean.`);
  }

  if (!Number.isInteger(raw.rank) || raw.rank < 1) {
    throw new Error(`Reminder ${index + 1}: rank must be a positive integer.`);
  }

  if (raw.scheduleType !== "daily" && raw.scheduleType !== "daysOfWeek") {
    throw new Error(`Reminder ${index + 1}: scheduleType must be 'daily' or 'daysOfWeek'.`);
  }

  const days = normalizeDays(raw.days);
  if (raw.scheduleType === "daysOfWeek" && days.length === 0) {
    throw new Error(`Reminder ${index + 1}: daysOfWeek requires at least one day (0-6).`);
  }

  const lastDoneDate = normalizeYmd(raw.lastDoneDate);
  if (raw.lastDoneDate !== null && !lastDoneDate) {
    throw new Error(`Reminder ${index + 1}: lastDoneDate must be YYYY-MM-DD or null.`);
  }

  const snoozeUntil = normalizeNullableNumber(raw.snoozeUntil, true);
  if (raw.snoozeUntil !== null && snoozeUntil === null) {
    throw new Error(`Reminder ${index + 1}: snoozeUntil must be a non-negative number or null.`);
  }

  const snoozeTabsRemaining = normalizeNullableNumber(raw.snoozeTabsRemaining, false);
  if (raw.snoozeTabsRemaining !== null && snoozeTabsRemaining === null) {
    throw new Error(`Reminder ${index + 1}: snoozeTabsRemaining must be a non-negative integer or null.`);
  }

  return {
    id,
    title,
    url,
    enabled: raw.enabled,
    rank: raw.rank,
    scheduleType: raw.scheduleType,
    days: raw.scheduleType === "daysOfWeek" ? days : [],
    lastDoneDate,
    snoozeUntil,
    snoozeTabsRemaining
  };
}

async function loadRemindersForSettings() {
  const raw = await storageGet(STORAGE_KEY);
  const issues = [];

  if (raw == null) {
    return { reminders: [], issues };
  }

  if (!Array.isArray(raw)) {
    await saveReminders([]);
    return {
      reminders: [],
      issues: ["Stored reminders were invalid and were reset to an empty list."]
    };
  }

  let changed = false;
  const valid = [];

  raw.forEach((entry, index) => {
    const sanitized = sanitizeLenientReminder(entry, index);
    if (!sanitized.valid) {
      changed = true;
      issues.push(`Dropped invalid reminder at position ${index + 1}.`);
      return;
    }

    changed = changed || sanitized.changed;
    valid.push(sanitized.value);
  });

  const hadContiguousRanks = hasContiguousRanks(valid);
  reminders = normalizeRanks(valid);
  if (!hadContiguousRanks) {
    changed = true;
  }

  if (changed) {
    await saveReminders(reminders);
  }

  return { reminders, issues };
}

function sanitizeLenientReminder(raw, index) {
  if (!raw || typeof raw !== "object") {
    return { valid: false, changed: false, value: null };
  }

  let changed = false;

  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : crypto.randomUUID();
  changed = changed || id !== raw.id;

  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "Untitled Reminder";
  changed = changed || title !== raw.title;

  const url = normalizeUrl(raw.url);
  if (!url) {
    return { valid: false, changed: false, value: null };
  }
  changed = changed || url !== raw.url;

  const enabled = typeof raw.enabled === "boolean" ? raw.enabled : true;
  changed = changed || enabled !== raw.enabled;

  const rank = Number.isInteger(raw.rank) && raw.rank > 0 ? raw.rank : index + 1;
  changed = changed || rank !== raw.rank;

  const scheduleType = raw.scheduleType === "daily" || raw.scheduleType === "daysOfWeek" ? raw.scheduleType : "daily";
  changed = changed || scheduleType !== raw.scheduleType;

  const days = normalizeDays(raw.days);
  changed = changed || !sameNumberArray(raw.days, days);

  if (scheduleType === "daysOfWeek" && days.length === 0) {
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
      days: scheduleType === "daysOfWeek" ? days : [],
      lastDoneDate,
      snoozeUntil,
      snoozeTabsRemaining
    }
  };
}

function normalizeRanks(items) {
  const ordered = [...items].sort(compareReminders);
  ordered.forEach((item, index) => {
    item.rank = index + 1;
  });
  return ordered;
}

function hasContiguousRanks(items) {
  const ordered = [...items].sort(compareReminders);
  return ordered.every((item, index) => item.rank === index + 1);
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

function formatDays(days) {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days.map((day) => labels[day]).join(", ");
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

async function saveReminders(nextReminders) {
  return new Promise((resolve, reject) => {
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

function showMessage(message) {
  elements.messageBanner.textContent = message;
  elements.messageBanner.classList.remove("hidden");
  elements.warningBanner.classList.add("hidden");
  elements.warningBanner.textContent = "";
}

function showWarning(message) {
  elements.warningBanner.textContent = message;
  elements.warningBanner.classList.remove("hidden");
  elements.messageBanner.classList.add("hidden");
  elements.messageBanner.textContent = "";
}

function showFormError(message) {
  elements.formError.textContent = message;
  elements.formError.classList.remove("hidden");
}

function clearFormError() {
  elements.formError.classList.add("hidden");
  elements.formError.textContent = "";
}
