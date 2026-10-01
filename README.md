# OpalDay

**Your day, gently organized.**

OpalDay is an iPhone- and iPad-friendly PWA for calendars, habits, home resets,
medications, reminders, progress, and a resolved daily timeline.

## This release

App version: **1.6.2**
Cloudflare Worker version: **1.5.13**

- Cron overlap safety: notification jobs are claimed before sending, so two
  overlapping scheduler runs can never double-send the same reminder
- Medication reminders are a true two-channel system: the worker push is the
  first channel, and the app's 60-second tick is the local backup while it's
  open — both use the same buckets and tags, so they dedupe instead of doubling
- Snoozing a medication pauses its whole schedule until the snooze expires,
  then fires one wake-up nudge (server and local channels agree)
- One-time reminders that stay open past their due date get a daily
  carry-forward nudge at their reminder time
- If iOS/browser notification permission is revoked while push is enabled, the
  app says so plainly instead of logging "delivered" into the void, and
  Settings shows when a reminder was last actually opened
- Shorter-lived push messages: medication alerts expire after 4 hours,
  everything else after 12
- Bounded history: completions and occurrence state older than 180 days,
  dismissed days older than 60, and day reminders/notice logs older than 7
  days are pruned on both client and server, and 413 sync failures surface
  instead of silently claiming "Saved on this device"
- Settings has a Backup card: download the planner as JSON, restore it later
  (a pre-restore copy is stashed first)
- Rescheduling a repeating medication moves its time, not its date, and no
  longer destroys its repeat pattern
- Deleted sports events stay deleted across feed refreshes; ICS imports honor
  UTC (Z) and TZID= timestamps instead of treating everything as local
- The service worker caches same-origin static files only, never API
  responses; visible tabs get the in-app banner instead of a duplicate OS
  notification

See `UPLOAD-INSTRUCTIONS.txt` for deployment and verification. The Worker is
`worker.js` in this repo.

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



## v1.5.5 — Reminder calendar rollover

- Reminders are enabled by default on the Calendar screen, including a one-time migration for existing installs.
- Open reminders carry forward on the calendar from their due date through the current day until completed.
- Reminders never pre-populate future days before those days arrive.
- Widgy keeps reminders in the Events / “What’s happening” section, including untimed reminders as “Anytime.”

## v1.5.2 — Compact checkbox rows
- Keeps “Send a notification” directly beside its checkbox in Reminder editing.
- Keeps “All day” directly beside its checkbox in Calendar Event editing.
- Prevents checkbox rows from widening mobile sheets and clipping content horizontally.

## v1.5.1 — Simple reminders
- Removed natural-language parsing. Titles are stored exactly as entered.
- Reminders are one-time only with an explicit due date.
- Removed streak behavior and automatic repeat rules from reminders.
- Reminder notifications default on; priority remains editable.
- Existing recurring reminder records are migrated to a single due date when possible.


## v1.5.5
- Fixed overdue reminder rollover for existing and newly created reminders.
- An incomplete reminder remains visible on each day from its due date through today until checked complete.
- Reminder completion is tracked against the reminder itself, not the current calendar day.
