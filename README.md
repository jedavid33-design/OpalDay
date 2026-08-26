# OpalDay

**Your day, gently organized.**

OpalDay is an iPhone- and iPad-friendly PWA for calendars, habits, home resets,
medications, reminders, progress, and a resolved daily timeline.

## This release

App version: **1.3.0**  
Cloudflare Worker version: **0.12.0**

- Avenir Next typography shared with the OpalDay Widgy design
- Resolved chronological `timedFeed` at `/widget/today`
- Display-ready `startTimeLabel` values in the requested timezone
- Automatic removal of finished timed events
- Persistent overdue medications until marked taken
- Non-destructive dismissal of all-day occurrences
- Due/incomplete Habits feed
- Deterministic local-date daily quote

See `UPLOAD-INSTRUCTIONS.txt` for deployment and verification. The Worker is
included in `cloudflare-worker-v0.12.0/`.

## Data safety

The app continues to use `opalday-data-v1`, the existing sync code, the same
D1 database and binding, and the existing event/item/calendar IDs. No SQL
migration, reset, or database replacement is required.
