# OpalDay

**Your day, gently organized.**

OpalDay is an iPhone- and iPad-friendly PWA for habits, home resets, anchored medications, subtasks, and a bubble-style daily timeline.

## Package contents

- The repository root is the GitHub Pages frontend.
- `worker/` contains the Cloudflare Worker and D1 schema used for device syncing.
- `config.js` connects the frontend to the deployed Worker.

## 1. Upload to GitHub

Create a repository named `opalday`, then upload everything in this folder, including the `worker` folder.

In the repository:

1. Open **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select **main** and **/(root)**.
4. Save.

GitHub Pages will publish the frontend at:

`https://YOUR-USERNAME.github.io/opalday/`

## 2. Create the D1 database

In Cloudflare:

1. Open **Storage & databases → D1 SQL database**.
2. Create a database named `opalday-db`.
3. Open its console and run the contents of `worker/schema.sql`.
4. Copy the database ID.
5. Paste that ID into `worker/wrangler.toml`.

## 3. Deploy the Worker

Create a Worker named `opalday-worker` and deploy the contents of `worker/worker.js`.

Bind the D1 database:

- Variable name: `DB`
- Database: `opalday-db`

After deploying, open:

`https://YOUR-WORKER-URL/health`

You should see:

`{"ok":true,"app":"OpalDay"}`

## 4. Connect the frontend

Open `config.js` and paste the Worker URL:

```js
window.OPALDAY_CONFIG = {
  workerUrl: "https://opalday-worker.YOUR-SUBDOMAIN.workers.dev"
};
```

Commit that change and wait for GitHub Pages to update.

## 5. Sync devices

1. Open OpalDay on the first device.
2. Tap **Set up sync → Create my sync code**.
3. Copy the eight-character code.
4. Open OpalDay on the second device.
5. Tap **Set up sync**, enter the same code, and connect.

## Version 0.3 features

## Version 0.4 additions

- Events, Habits, Medications, Resets, and Completed overlay toggles
- Habit and reset overlays across Timeline, Day, Week, and Month
- Flexible weekly goals in an Anytime This Week band
- Monthly resets in a This Month band
- Medication doses as hard deadlines with overdue priority
- Taken, Snooze 30m, and Reschedule actions
- Escalating medication reminders when OpalDay is active
- Built-in US federal holidays in the color-controlled Holidays calendar

- Blank slate; no hardwired habits
- Natural entry that suggests a schedule without locking it in
- Editable type, frequency, weekly target, preferred day, time, interval, and hard date before saving
- Optional comma-separated subtasks after a colon
- Bubble-style daily timeline
- Flexible Monday–Sunday weekly goals and monthly resets
- Working Habits and Progress screens
- Per-period completion progress and weekly activity graph
- System details and delete controls
- Private sync code
- Automatic sync when the app regains focus
- Offline PWA shell
- Opal app icon

Existing v0.1 data and sync codes remain compatible.

### Calendar

- Timeline, Day, Monday–Sunday Week, and Month views
- Multiple calendars with editable colors and visibility controls
- Manual events with start and end times
- Upload .ics files
- Link public HTTPS iCal feeds and refresh them through the Worker
- Daily automatic refresh plus Refresh linked calendars
- Imported events remain editable
- User edits survive feed refreshes
- Deleted feed events stay deleted

### Visual refresh

- Richer opal background color
- Plum/wine navigation, buttons, filters, and progress accents
- Calendar-colored event rails, cards, and month dots

## Updating from v0.2

Upload the files in the v0.3 GitHub package to the repository root. Do not
replace config.js; it already contains your deployed Worker address.

Then replace the deployed Cloudflare Worker code with worker/worker.js and
deploy. The existing D1 database and DB binding stay unchanged.
