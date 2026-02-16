# Streak Reminders (Chrome Extension, Manifest V3)

Streak Reminders replaces Chrome's New Tab page and shows your highest-priority due reminder each time you open a new tab.

## Features

- New Tab override via `chrome_url_overrides`
- Optional setting: automatically return to the browser's default New Tab page once all reminders scheduled for today are done
  - In Brave, it prefers `brave://newtab/` so the Brave dashboard page (clock/stats) is restored
- Automatically follows the device/browser dark-light theme on both New Tab and Settings pages
- Priority queue behavior (`rank` ascending)
- Due logic with local date (`YYYY-MM-DD`) and done-for-today tracking
- Snooze options:
  - 1 hour
  - 3 hours
  - Tomorrow at 09:00 (local)
  - Next 5 tabs
- Dismiss for current tab only (non-persistent)
- Undo for accidental “Done” actions (from New Tab and Settings)
- Options UI to add/edit/delete reminders
- Rank up/down controls with automatic rank normalization
- Templates: Duolingo, LeetCode, Gmail weekdays
- Import/export JSON with strict validation
- Uses only `chrome.storage.sync` (no external APIs, no analytics)

## Install

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder:
   - `/Users/mike/Documents/Projects/Typescript/Browser Extensions/Streak reminder`

## Data Model

Each reminder is stored under `chrome.storage.sync` key `reminders` and contains:

```json
{
  "id": "uuid",
  "title": "string",
  "url": "https://...",
  "enabled": true,
  "rank": 1,
  "scheduleType": "daily",
  "days": [],
  "lastDoneDate": null,
  "snoozeUntil": null,
  "snoozeTabsRemaining": null
}
```

## Due Logic

A reminder is due when all are true:

- `enabled === true`
- Schedule matches today (`daily` always; `daysOfWeek` includes today's day)
- `lastDoneDate !== today` (local `YYYY-MM-DD`)
- `snoozeUntil` is null or in the past
- `snoozeTabsRemaining` is null or `<= 0`

## New Tab Snooze-Tab Handling

On each New Tab load:

1. Due reminders are evaluated and rendered first.
2. Then all reminders with `snoozeTabsRemaining > 0` are decremented and saved.

This makes “next 5 tabs” suppress exactly the next 5 tab opens.

## Import/Export Notes

- Export writes the full reminders array in JSON.
- Import replaces all reminders.
- Import validation is strict and all-or-nothing.
- URL must be `http` or `https`.
- `daysOfWeek` reminders must include at least one day (`0-6`).

## Privacy

- No network calls
- No tracking/analytics
- No host permissions
- No content scripts
- Data stored only in `chrome.storage.sync`
