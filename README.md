# OpalDay

**Your day, gently organized.**

OpalDay is an iPhone- and iPad-friendly PWA for calendars, habits, home resets,
medications, reminders, progress, and a resolved daily timeline.

## This release

App version: **1.3.1**  
Cloudflare Worker version: **0.12.1**

- Compact real-item-only Widgy arrays with live counts and footer stats
- Verified chronological timed medication behavior
- Existing all-day dismissal behavior preserved
- iPad-only header safe zone for system window controls
- Completed Avenir Next Medium/Regular role audit

See `UPLOAD-INSTRUCTIONS.txt` for deployment and verification. The Worker is
included in `cloudflare-worker-v0.12.1/`.

## Data safety

The app continues to use `opalday-data-v1`, the existing sync code, the same
D1 database and binding, and the existing event/item/calendar IDs. No SQL
migration, reset, or database replacement is required.
