"use strict";

(function attachProgressEngine(globalScope) {
  const PROGRESS_VERSION = 1;

  function getTodayProgress(reminders, nowMs) {
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    const date = new Date(now);
    const todayYmd = getTodayLocalYmd(date);
    const todayDow = date.getDay();

    let requiredCount = 0;
    let doneCount = 0;

    if (Array.isArray(reminders)) {
      reminders.forEach((reminder) => {
        if (!isReminderRequiredNow(reminder, todayDow, now)) {
          return;
        }
        requiredCount += 1;
        if (reminder.lastDoneDate === todayYmd) {
          doneCount += 1;
        }
      });
    }

    return {
      date: todayYmd,
      requiredCount,
      doneCount,
      status: deriveStatus(requiredCount, doneCount)
    };
  }

  function reconcileDayRollover(progress, reminders, todayYmdInput) {
    const todayYmd = isValidYmd(todayYmdInput) ? todayYmdInput : getTodayLocalYmd(new Date());
    const next = deepClone(progress);

    if (compareYmd(next.lastSeenDate, todayYmd) > 0) {
      next.lastSeenDate = todayYmd;
      next.today = createDefaultToday(todayYmd);
      return next;
    }

    if (compareYmd(next.lastSeenDate, todayYmd) === 0) {
      if (!next.today || next.today.date !== todayYmd) {
        next.today = createDefaultToday(todayYmd);
      }
      return next;
    }

    const previousToday = next.today;
    if (
      previousToday &&
      previousToday.date === next.lastSeenDate &&
      previousToday.requiredCount > 0 &&
      previousToday.status === "incomplete"
    ) {
      next.currentStreak = 0;
    }

    const skippedStart = addDaysYmd(next.lastSeenDate, 1);
    const skippedEnd = addDaysYmd(todayYmd, -1);
    if (
      skippedStart &&
      skippedEnd &&
      compareYmd(skippedStart, skippedEnd) <= 0 &&
      hasMissedDueDayBetween(reminders, skippedStart, skippedEnd)
    ) {
      next.currentStreak = 0;
    }

    next.lastSeenDate = todayYmd;
    next.today = createDefaultToday(todayYmd);
    return next;
  }

  function applyTodayProgress(progress, todayProgress) {
    const next = deepClone(progress);
    const progressDate = isValidYmd(todayProgress?.date)
      ? todayProgress.date
      : getTodayLocalYmd(new Date());

    if (!next.today || next.today.date !== progressDate) {
      next.today = createDefaultToday(progressDate);
    }

    if (compareYmd(next.lastSeenDate, progressDate) < 0) {
      next.lastSeenDate = progressDate;
    }

    const today = next.today;
    const requiredCount = asNonNegativeInt(todayProgress?.requiredCount, 0);
    const doneCount = clamp(asNonNegativeInt(todayProgress?.doneCount, 0), 0, requiredCount);
    const status = deriveStatus(requiredCount, doneCount);

    today.date = progressDate;
    today.requiredCount = requiredCount;
    today.doneCount = doneCount;
    today.status = status;

    if (status === "complete") {
      if (!today.contributed) {
        today.prevCurrentStreak = next.currentStreak;
        today.prevBestStreak = next.bestStreak;
        today.prevLastCompletedDueDate = next.lastCompletedDueDate;

        next.currentStreak += 1;
        next.bestStreak = Math.max(next.bestStreak, next.currentStreak);
        next.lastCompletedDueDate = progressDate;
        today.contributed = true;
      }
    } else if (today.contributed) {
      next.currentStreak = asNonNegativeInt(today.prevCurrentStreak, 0);
      next.bestStreak = Math.max(asNonNegativeInt(today.prevBestStreak, 0), next.currentStreak);
      next.lastCompletedDueDate = normalizeNullableYmd(today.prevLastCompletedDueDate);
      today.contributed = false;
    }

    return next;
  }

  function sanitizeProgress(raw, todayYmdInput) {
    const todayYmd = isValidYmd(todayYmdInput) ? todayYmdInput : getTodayLocalYmd(new Date());
    let changed = false;
    const issues = [];

    if (raw == null) {
      return {
        progress: createDefaultProgress(todayYmd),
        changed: true,
        issues
      };
    }

    if (typeof raw !== "object" || Array.isArray(raw)) {
      return {
        progress: createDefaultProgress(todayYmd),
        changed: true,
        issues: ["Progress data was invalid and has been reset."]
      };
    }

    const progress = createDefaultProgress(todayYmd);

    progress.version = PROGRESS_VERSION;
    if (raw.version !== PROGRESS_VERSION) {
      changed = true;
    }

    const trackingStartedDate = normalizeYmd(raw.trackingStartedDate);
    if (trackingStartedDate) {
      progress.trackingStartedDate = trackingStartedDate;
    } else if (raw.trackingStartedDate != null) {
      changed = true;
    }

    const lastSeenDate = normalizeYmd(raw.lastSeenDate);
    if (lastSeenDate) {
      progress.lastSeenDate = lastSeenDate;
    } else if (raw.lastSeenDate != null) {
      changed = true;
    }

    if (compareYmd(progress.lastSeenDate, progress.trackingStartedDate) < 0) {
      progress.lastSeenDate = progress.trackingStartedDate;
      changed = true;
    }

    progress.currentStreak = asNonNegativeInt(raw.currentStreak, 0);
    progress.bestStreak = asNonNegativeInt(raw.bestStreak, 0);
    if (progress.bestStreak < progress.currentStreak) {
      progress.bestStreak = progress.currentStreak;
      changed = true;
    }

    progress.lastCompletedDueDate = normalizeNullableYmd(raw.lastCompletedDueDate);
    if (raw.lastCompletedDueDate != null && progress.lastCompletedDueDate == null) {
      changed = true;
    }

    const sanitizedToday = sanitizeToday(raw.today, progress.lastSeenDate);
    progress.today = sanitizedToday.today;
    changed = changed || sanitizedToday.changed;

    return { progress, changed, issues };
  }

  function hasMissedDueDayBetween(reminders, fromYmd, toYmd) {
    if (!isValidYmd(fromYmd) || !isValidYmd(toYmd) || compareYmd(fromYmd, toYmd) > 0) {
      return false;
    }

    let cursor = fromYmd;
    while (compareYmd(cursor, toYmd) <= 0) {
      if (hasRequiredReminderForDate(reminders, cursor)) {
        return true;
      }
      cursor = addDaysYmd(cursor, 1);
      if (!cursor) {
        break;
      }
    }

    return false;
  }

  function sanitizeToday(rawToday, fallbackDate) {
    let changed = false;
    const date = normalizeYmd(rawToday?.date) || fallbackDate;
    if (!rawToday || typeof rawToday !== "object" || Array.isArray(rawToday)) {
      return { today: createDefaultToday(date), changed: true };
    }

    const today = createDefaultToday(date);

    today.requiredCount = asNonNegativeInt(rawToday.requiredCount, 0);
    today.doneCount = clamp(asNonNegativeInt(rawToday.doneCount, 0), 0, today.requiredCount);
    if (today.doneCount !== rawToday.doneCount || today.requiredCount !== rawToday.requiredCount) {
      changed = true;
    }

    const derivedStatus = deriveStatus(today.requiredCount, today.doneCount);
    today.status = derivedStatus;
    if (rawToday.status !== derivedStatus) {
      changed = true;
    }

    today.contributed = typeof rawToday.contributed === "boolean" ? rawToday.contributed : false;
    if (typeof rawToday.contributed !== "boolean") {
      changed = true;
    }

    today.prevCurrentStreak = asNonNegativeInt(rawToday.prevCurrentStreak, 0);
    today.prevBestStreak = asNonNegativeInt(rawToday.prevBestStreak, 0);
    today.prevLastCompletedDueDate = normalizeNullableYmd(rawToday.prevLastCompletedDueDate);

    if (today.status !== "complete" && today.contributed) {
      today.contributed = false;
      changed = true;
    }

    return { today, changed };
  }

  function hasRequiredReminderForDate(reminders, ymd) {
    if (!Array.isArray(reminders)) {
      return false;
    }

    const date = parseYmd(ymd);
    if (!date) {
      return false;
    }
    const dow = date.getDay();

    return reminders.some((reminder) => reminder?.enabled === true && matchesSchedule(reminder, dow));
  }

  function isReminderRequiredNow(reminder, dow, nowMs) {
    if (!reminder || reminder.enabled !== true) {
      return false;
    }

    if (!matchesSchedule(reminder, dow)) {
      return false;
    }

    if (typeof reminder.snoozeUntil === "number" && reminder.snoozeUntil > nowMs) {
      return false;
    }

    if (typeof reminder.snoozeTabsRemaining === "number" && reminder.snoozeTabsRemaining > 0) {
      return false;
    }

    return true;
  }

  function matchesSchedule(reminder, dow) {
    return (
      reminder.scheduleType === "daily" ||
      (reminder.scheduleType === "daysOfWeek" && Array.isArray(reminder.days) && reminder.days.includes(dow))
    );
  }

  function createDefaultProgress(todayYmd) {
    return {
      version: PROGRESS_VERSION,
      trackingStartedDate: todayYmd,
      lastSeenDate: todayYmd,
      currentStreak: 0,
      bestStreak: 0,
      lastCompletedDueDate: null,
      today: createDefaultToday(todayYmd)
    };
  }

  function createDefaultToday(dateYmd) {
    return {
      date: dateYmd,
      requiredCount: 0,
      doneCount: 0,
      status: "neutral",
      contributed: false,
      prevCurrentStreak: 0,
      prevBestStreak: 0,
      prevLastCompletedDueDate: null
    };
  }

  function deriveStatus(requiredCount, doneCount) {
    if (requiredCount <= 0) {
      return "neutral";
    }
    return doneCount >= requiredCount ? "complete" : "incomplete";
  }

  function getTodayLocalYmd(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function normalizeYmd(value) {
    if (!isValidYmd(value)) {
      return null;
    }
    return value;
  }

  function normalizeNullableYmd(value) {
    if (value == null) {
      return null;
    }
    return normalizeYmd(value);
  }

  function isValidYmd(value) {
    if (typeof value !== "string") {
      return false;
    }

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

  function parseYmd(ymd) {
    if (!isValidYmd(ymd)) {
      return null;
    }
    const [year, month, day] = ymd.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function addDaysYmd(ymd, days) {
    const date = parseYmd(ymd);
    if (!date || !Number.isFinite(days)) {
      return null;
    }
    date.setDate(date.getDate() + days);
    return getTodayLocalYmd(date);
  }

  function compareYmd(a, b) {
    if (!isValidYmd(a) || !isValidYmd(b)) {
      return 0;
    }
    if (a === b) {
      return 0;
    }
    return a < b ? -1 : 1;
  }

  function asNonNegativeInt(value, fallback) {
    if (Number.isInteger(value) && value >= 0) {
      return value;
    }
    return fallback;
  }

  function clamp(value, min, max) {
    if (value < min) {
      return min;
    }
    if (value > max) {
      return max;
    }
    return value;
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  globalScope.StreakProgressEngine = {
    getTodayProgress,
    reconcileDayRollover,
    applyTodayProgress,
    sanitizeProgress,
    hasMissedDueDayBetween
  };
})(window);
