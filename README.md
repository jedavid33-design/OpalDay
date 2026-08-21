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

## Current first-release features

- Blank slate; no hardwired habits
- Natural entry for daily, weekly, monthly, and multi-week items
- Optional comma-separated subtasks after a colon
- Bubble-style daily timeline
- Completion progress
- Private sync code
- Automatic sync when the app regains focus
- Offline PWA shell
- Opal app icon

The Habits and Progress tabs are placeholders for the next release.
