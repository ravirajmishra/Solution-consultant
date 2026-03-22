# OptiCore — Enterprise Intelligence Platform

## Deploy to Vercel in 3 minutes

### Step 1 — Get your free Gemini API key
1. Go to https://aistudio.google.com/app/apikey
2. Click "Create API Key"
3. Copy the key (starts with AIza...)

### Step 2 — Deploy to Vercel
Option A — Vercel CLI:
```bash
npm i -g vercel
cd opticore
vercel --prod
```

Option B — Vercel Dashboard:
1. Go to https://vercel.com/new
2. Import this folder as a project
3. Click Deploy

### Step 3 — Add your API key as environment variable
1. In your Vercel project → Settings → Environment Variables
2. Add: Name = `GEMINI_API_KEY`, Value = your key from Step 1
3. Click Save → Redeploy

That's it. Your platform is live.

## Why a serverless proxy?
Browsers block direct calls to the Gemini API (CORS restriction).
The `/api/analyze.js` function runs on Vercel's servers — no CORS issue.
Your API key never touches the browser.

## Project structure
```
opticore/
├── api/
│   └── analyze.js      ← Vercel serverless function (Gemini proxy)
├── public/
│   └── index.html      ← Full platform frontend
├── vercel.json         ← Routing config
└── README.md
```

## Free tier limits
- Gemini 2.5 Flash: 500 requests/day (free), 1M tokens/min
- Vercel: 100GB bandwidth/month, unlimited deploys
- Google Search grounding: included in Gemini free tier
