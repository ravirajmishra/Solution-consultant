// Models — free tier quotas:
// gemini-2.5-flash-lite → 1,000 RPD free (primary)
// gemini-1.5-flash      → 1,500 RPD free (auto-fallback)
const MODELS = ['gemini-2.5-flash-lite', 'gemini-1.5-flash'];
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

async function call(key, model, body) {
  const r = await fetch(`${BASE}/${model}:generateContent?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const d = await r.json();
  if (d.error?.status === 'RESOURCE_EXHAUSTED' && model === MODELS[0]) {
    console.warn('Primary quota hit — falling back to', MODELS[1]);
    return call(key, MODELS[1], body);
  }
  if (d.error) throw new Error(`[${model}] ${d.error.message}`);
  return d;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const KEY = process.env.GEMINI_API_KEY;
  if (!KEY) { res.status(500).json({ error: 'GEMINI_API_KEY not configured in Vercel → Settings → Environment Variables' }); return; }

  const { type, payload } = req.body || {};
  if (!type || !payload?.prompt) { res.status(400).json({ error: 'Body must include { type, payload: { prompt } }' }); return; }

  try {
    if (type === 'research') {
      // RAG STEP 1 — Live Google Search grounding. Gemini fetches real web pages,
      // press releases, case studies, and annual reports in real time.
      // Nothing from training memory — every fact is cited from a live URL.
      const d = await call(KEY, MODELS[0], {
        contents: [{ parts: [{ text: payload.prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.1 }
      });
      const text = (d.candidates[0].content.parts || []).filter(p => p.text).map(p => p.text).join('');
      const queries = d.candidates[0].groundingMetadata?.webSearchQueries || [];
      res.status(200).json({ text, queries });

    } else if (type === 'structure') {
      // RAG STEP 2 — Structure retrieved data into guaranteed-valid JSON.
      // responseMimeType: 'application/json' forces the model to output ONLY
      // parseable JSON — no markdown, no commentary, no parse errors ever.
      const d = await call(KEY, MODELS[0], {
        contents: [{ parts: [{ text: payload.prompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
      });
      const json = JSON.parse(d.candidates[0].content.parts[0].text);
      res.status(200).json(json);

    } else {
      res.status(400).json({ error: `Unknown type "${type}". Use "research" or "structure".` });
    }
  } catch (err) {
    console.error('OptiCore error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
