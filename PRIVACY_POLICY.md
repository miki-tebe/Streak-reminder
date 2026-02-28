# Privacy Policy for Streak Reminders

Last updated: February 28, 2026

## Overview

Streak Reminders is a browser extension that replaces the New Tab page and helps you manage recurring reminder links. This extension is designed to work without collecting personal data for analytics, advertising, or tracking.

## Information the Extension Stores

The extension stores only the information needed to provide its features:

- Reminder data you create, such as:
  - reminder title
  - reminder URL
  - enabled/disabled state
  - priority order
  - schedule settings
  - completion and snooze state
- Extension settings, such as whether to return to the browser's default New Tab page when all reminders are done
- Streak progress data, such as:
  - current streak
  - best streak
  - per-day progress status

This data is stored in `chrome.storage.sync`.

## How Your Data Is Used

Your data is used only to:

- show reminders on the New Tab page
- track which reminders are due
- track your completion progress and streaks
- save your preferences
- support import and export of your reminder data

The extension does not use your data for profiling, advertising, or analytics.

## Data Storage and Sync

Streak Reminders uses `chrome.storage.sync`, which means your reminder data may be synchronized by your browser vendor (for example, Chrome) across devices signed into the same browser account, subject to that browser vendor's own policies and settings.

The extension itself does not operate its own servers and does not transmit your data to any developer-controlled backend.

## Permissions

The extension currently uses these permissions:

- `storage`: used to save reminders, settings, and streak progress
- `tabs`: used only to open reminder links in tabs and to restore the browser's default New Tab page when that feature is enabled

The extension does not use host permissions, content scripts, or broad website access.

## No Tracking or External Data Collection

Streak Reminders does not:

- collect analytics or telemetry
- use advertising SDKs
- send data to external APIs controlled by the developer
- sell your data
- share your data with third parties for marketing purposes

## Import and Export

If you choose to export your reminders, the extension generates a JSON file containing your reminder data locally in your browser. If you choose to import a JSON file, the file is processed locally by the extension and used to replace the stored reminder data.

## Your Choices

You can control your data at any time by:

- editing or deleting reminders in the extension options page
- disabling or removing the extension
- clearing synced extension data through your browser, where supported

## Third-Party Services

The extension may open URLs that you save as reminders, but those websites are controlled by their own operators and privacy policies. This Privacy Policy applies only to the Streak Reminders extension itself.

## Changes to This Policy

If the extension's data practices change, this Privacy Policy should be updated to reflect those changes.
