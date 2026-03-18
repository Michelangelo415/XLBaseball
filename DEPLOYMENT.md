# Fantasy Baseball League Engine — Deployment Guide

Everything you need to go from code to a live hosted app.

---

## What You're Deploying

| Piece | What it is |
|-------|-----------|
| **Backend** | Node.js + Express API server (handles all logic, MLB stat pulls, scoring) |
| **Frontend** | React app (the web interface everyone uses) |
| **Database** | PostgreSQL (stores all league data) |
| **Host** | Render.com (free tier covers both backend + DB) |

---

## Step 1 — Create a GitHub Repository

The easiest way to deploy on Render is to push your code to GitHub first.

1. Go to [github.com](https://github.com) and create a new repository called `fantasy-league`
2. On your computer, open a terminal in the `fantasy-league` folder and run:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/fantasy-league.git
git push -u origin main
```

---

## Step 2 — Create a Render Account

1. Go to [render.com](https://render.com) and sign up (free)
2. Connect your GitHub account when prompted

---

## Step 3 — Create the PostgreSQL Database

1. In Render dashboard → **New** → **PostgreSQL**
2. Settings:
   - **Name:** `fantasy-league-db`
   - **Region:** Oregon (US West) or closest to you
   - **Plan:** Free
3. Click **Create Database**
4. Once created, copy the **Internal Database URL** — you'll need it shortly

---

## Step 4 — Deploy the Backend

1. Render dashboard → **New** → **Web Service**
2. Connect your GitHub repo
3. Settings:
   - **Name:** `fantasy-league-api`
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free

4. Under **Environment Variables**, add all of these:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | *(paste the Internal Database URL from Step 3)* |
| `JWT_SECRET` | *(generate a long random string — use [randomkeygen.com](https://randomkeygen.com))* |
| `FRONTEND_URL` | *(leave blank for now — fill in after frontend is deployed)* |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | *(see Step 6 below for Google Sheets setup)* |
| `COMMISSIONER_EMAIL` | `your@email.com` |
| `COMMISSIONER_PASSWORD` | *(your chosen password)* |

5. Click **Create Web Service**
6. Wait for the first deploy to finish (~3 minutes)
7. Copy your backend URL (looks like `https://fantasy-league-api.onrender.com`)

---

## Step 5 — Run the Database Setup

Once the backend is deployed:

1. In Render, go to your backend service → **Shell** tab
2. Run these commands one at a time:

```bash
# Apply the database schema (creates all tables)
npm run db:migrate

# Seed initial data (creates commissioner + 6 placeholder teams)
npm run db:seed
```

The seed output will show you all the team owner emails and their temporary passwords (`temppass123`). Share those with your league members — they can log in and the commissioner can update team names.

---

## Step 6 — Google Sheets API Setup

This lets you import your existing rosters from a Google Sheet.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (call it `fantasy-league`)
3. Enable the **Google Sheets API**:
   - Search "Google Sheets API" → Enable
4. Create a Service Account:
   - **IAM & Admin** → **Service Accounts** → **Create Service Account**
   - Name it `fantasy-league-sheets`
   - Skip optional steps, click Done
5. Create a JSON key:
   - Click your new service account → **Keys** tab → **Add Key** → **JSON**
   - A `.json` file will download
6. Copy the **entire contents** of that JSON file
7. In Render, go to your backend → Environment → find `GOOGLE_SERVICE_ACCOUNT_JSON`
8. Paste the entire JSON as the value (it's one long string)

> **Important:** When you share your Google Sheet for import, share it with the `client_email` address from your service account JSON file, with **Viewer** access.

---

## Step 7 — Deploy the Frontend

1. Render dashboard → **New** → **Static Site**
2. Connect your GitHub repo
3. Settings:
   - **Name:** `fantasy-league-app`
   - **Root Directory:** `frontend`
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `build`
4. Add one **Environment Variable**:
   - `REACT_APP_API_URL` = `https://fantasy-league-api.onrender.com/api`
     *(replace with your actual backend URL from Step 4)*
5. Click **Create Static Site**

Once deployed, copy your frontend URL (e.g. `https://fantasy-league-app.onrender.com`)

---

## Step 8 — Connect Frontend ↔ Backend

1. Go back to your **backend** service on Render
2. Update the `FRONTEND_URL` environment variable to your frontend URL
3. Render will auto-redeploy

---

## Step 9 — First Login

1. Open your frontend URL
2. Log in with your commissioner credentials (set in Step 4)
3. Go to **Commissioner Dashboard** → **Sync MLB Rosters** (pulls all active MLB players into the DB)
4. Go to **Import Rosters** to load your Google Sheets roster

---

## Updating the App Later

When you make code changes:

```bash
git add .
git commit -m "Description of change"
git push
```

Render auto-deploys on every push to `main`.

---

## Free Tier Limitations

Render's free tier has a couple of quirks:

- **Spin-down:** The backend goes to sleep after 15 minutes of inactivity. The first request after sleeping takes ~30 seconds. This is fine for a 6-person fantasy league — just warn your users.
- **Build minutes:** 500/month free (more than enough)
- **DB storage:** 1 GB free (easily enough for a full season)

To avoid spin-down, you can use a free service like [cron-job.org](https://cron-job.org) to ping your backend URL every 10 minutes.

---

## Local Development

If you want to run everything on your computer for testing:

```bash
# Terminal 1 — Backend
cd backend
cp .env.example .env
# Edit .env with your local Postgres connection string
npm install
npm run db:migrate
npm run db:seed
npm run dev

# Terminal 2 — Frontend
cd frontend
npm install
npm start
```

Frontend runs at `http://localhost:3000`, backend at `http://localhost:4000`.

---

## Troubleshooting

**"Cannot connect to database"**
→ Check that `DATABASE_URL` in your backend env matches exactly what Render shows for your PostgreSQL internal URL.

**"Google Sheets import fails"**
→ Make sure the sheet is shared with your service account email and that `GOOGLE_SERVICE_ACCOUNT_JSON` is the full JSON with no extra whitespace.

**"Player not found during import"**
→ Run **Sync MLB Rosters** from the Commissioner Dashboard first, then retry the import. For minor leaguers not in the MLB API, add their MLB ID manually in the sheet.

**Trades page shows no assets**
→ The `assets` column in the trades query uses `json_agg` — if you see `[null]` instead of player names, it means the `trade_assets` rows exist but `mlb_players` lookup failed. Check that player MLB IDs are correct.

**Frontend shows blank page after deploy**
→ Check that `REACT_APP_API_URL` is set correctly in the static site environment and starts with `https://`.
