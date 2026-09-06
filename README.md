# OpalDay

**Your day, gently organized.**

OpalDay is an iPhone- and iPad-friendly PWA for calendars, habits, home resets,
medications, reminders, progress, and a resolved daily timeline.

## This release

App version: **1.5.1**  
Cloudflare Worker version: **0.12.4**

- Recurring parent and checklist state is scoped to the scheduled occurrence
- Daily, fixed-day weekly, interval, and monthly occurrences begin fresh on
  their next designated local date even when the prior occurrence was unfinished
- Flexible weekly goals retain their existing Sunday-through-Saturday period behavior
- Existing completion timestamps remain the historical compatibility source
- Occurrence-state sync resolves newer changes without resurrecting cleared state
- Today and `/widget/today` use matching occurrence and due-date semantics
- Today event cards show calendar identity once in their metadata, without a
  duplicate right-side calendar-name badge

See `UPLOAD-INSTRUCTIONS.txt` for deployment and verification. The Worker is
included in `cloudflare-worker-v0.12.4/`.

## Data safety

The app continues to use `opalday-data-v1`, the existing sync code, the same
D1 database and binding, and the existing event/item/calendar IDs. No SQL
migration, reset, or database replacement is required.

## v1.5.0 — Reminders
- Added a Reminder item type for one-time and recurring future tasks.
- Reminder dates can be one-time, weekly/monthly, or every N months after completion.
- Natural entry recognizes phrases such as “remind me Tuesday…”, “tomorrow”, and “in 3 months”.
- Reminders can carry forward on Today when overdue until completed.
- Reminders have priority and optional push notification support.
- Habit priority can now be edited directly from System Details.
- Existing “Refill med container” entries that were accidentally classified as Medication are migrated to Habit.

## v1.5.1 — Simple reminders
- Removed natural-language parsing. Titles are stored exactly as entered.
- Reminders are one-time only with an explicit due date.
- Removed streak behavior and automatic repeat rules from reminders.
- Reminder notifications default on; priority remains editable.
- Existing recurring reminder records are migrated to a single due date when possible.
