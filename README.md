# OpalDay

**Your day, gently organized.**

OpalDay is an iPhone- and iPad-friendly PWA for calendars, habits, home resets,
medications, reminders, progress, and a resolved daily timeline.

## This release

App version: **1.3.2**  
Cloudflare Worker version: **0.12.3**

- Expired timed events leave Today after their explicit end or a one-hour fallback
- Daily incomplete habits receive priority in the fixed Widgy habit slots
- Empty streak labels use the ASCII-safe hyphen required by Widgy
- Existing calendar views, storage, recurrence, sync, and widget arrays are preserved

See `UPLOAD-INSTRUCTIONS.txt` for deployment and verification. The Worker is
included in `cloudflare-worker-v0.12.3/`.

## Data safety

The app continues to use `opalday-data-v1`, the existing sync code, the same
D1 database and binding, and the existing event/item/calendar IDs. No SQL
migration, reset, or database replacement is required.
