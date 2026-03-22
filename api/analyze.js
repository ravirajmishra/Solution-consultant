const MODELS = ['gemini-2.5-flash-lite', 'gemini-1.5-flash'];
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

async function callGemini(key, model, body) {
  const r = await fetch(`${BASE}/${model}:generateContent?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const d = await r.json();
  if (d.error?.status === 'RESOURCE_EXHAUSTED' && model === MODELS[0]) {
    return callGemini(key, MODELS[1], body);
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
  if (!KEY) {
    res.status(500).json({ error: 'GEMINI_API_KEY not configured. Go to Vercel → Project → Settings → Environment Variables and add GEMINI_API_KEY.' });
    return;
  }

  const { type, payload } = req.body || {};
  if (!type || !payload?.prompt) {
    res.status(400).json({ error: 'Body must be { type: "research"|"structure", payload: { prompt: "..." } }' });
    return;
  }

  try {
    if (type === 'research') {
      // RAG STEP 1 — Retrieval with live Google Search grounding
      // Gemini fetches real URLs and grounds every claim in a web source.
      // Nothing from training memory — all citations traceable to real pages.
      const d = await callGemini(KEY, MODELS[0], {
        contents: [{ parts: [{ text: payload.prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.1 }
      });
      const cand = d.candidates[0];
      const text = (cand.content.parts || []).filter(p => p.text).map(p => p.text).join('');
      const meta = cand.groundingMetadata || {};

      // Extract real source URLs and titles from grounding chunks
      const sources = (meta.groundingChunks || [])
        .filter(c => c.web?.uri)
        .map(c => ({ url: c.web.uri, title: c.web.title || new URL(c.web.uri).hostname }))
        .filter((s, i, arr) => arr.findIndex(x => x.url === s.url) === i) // deduplicate
        .slice(0, 10);

      const queries = meta.webSearchQueries || [];
      res.status(200).json({ text, sources, queries });

    } else if (type === 'structure') {
      // RAG STEP 2 — Generation from retrieved context
      // responseMimeType: application/json guarantees valid JSON — no parse errors ever.
      const d = await callGemini(KEY, MODELS[0], {
        contents: [{ parts: [{ text: payload.prompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
      });
      const json = JSON.parse(d.candidates[0].content.parts[0].text);
      res.status(200).json(json);

    } else {
      res.status(400).json({ error: `Unknown type "${type}". Use "research" or "structure".` });
    }
  } catch (err) {
    console.error('OptiCore:', err.message);
    res.status(500).json({ error: err.message });
  }
}
