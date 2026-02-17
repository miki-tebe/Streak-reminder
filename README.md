# Streak Reminders

Streak Reminders is a Manifest V3 browser extension that replaces the New Tab page and shows your highest-priority due streak reminder.

## Highlights

- New Tab override with priority-queue behavior (`rank` ascending)
- Done-for-today tracking (`YYYY-MM-DD`, local time)
- Snooze options: 1 hour, 3 hours, tomorrow at 09:00, or next 5 tabs
- Undo for accidental `Done` actions
- Optional auto-return to browser default New Tab when all due streaks are done
  - In Brave, this prefers `brave://newtab/` to restore Brave Dashboard
- Full reminder management in Options page (add/edit/delete, enable/disable, rank up/down)
- Templates: Duolingo, LeetCode, Gmail weekdays
- Import/export JSON with strict validation
- Light/dark theme support based on system/browser theme

## Installation (Public Repo)

### 1. Clone the repository

```bash
git clone <YOUR_REPO_URL>
cd "Streak reminder"
```

### 2. Load unpacked in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the project folder (the folder that contains `manifest.json`)

### 3. Load unpacked in Brave

1. Open `brave://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the project folder (the folder that contains `manifest.json`)

## Usage

- Open a new tab to see due reminders.
- Use `Open`, `Done`, `Snooze`, or `Dismiss` from the reminder card.
- Open extension settings from the New Tab page (`Manage reminders`) or extensions page (`Details` -> `Extension options`).

## Reminder Data Model

All reminders are stored in `chrome.storage.sync` under key `reminders`:

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
- Schedule matches today (`daily` always, `daysOfWeek` includes today)
- `lastDoneDate !== today` (local date)
- `snoozeUntil` is null or in the past
- `snoozeTabsRemaining` is null or `<= 0`

## Import / Export

- Export writes the full reminders array as JSON
- Import replaces all reminders
- Import validation is all-or-nothing
- URL must be `http` or `https`
- `daysOfWeek` reminders must include at least one day (`0-6`)

## Permissions

- `storage`
- `tabs`

No host permissions, notifications, or content scripts.

## Privacy

- No external APIs
- No tracking or analytics
- Data is stored only in `chrome.storage.sync`
