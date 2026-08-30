# OpalDay

**Your day, gently organized.**

OpalDay is an iPhone- and iPad-friendly PWA for calendars, habits, home resets,
medications, reminders, progress, and a resolved daily timeline.

## This release

App version: **1.3.4**  
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
