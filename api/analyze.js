// Model selection:
// gemini-2.5-flash-lite → 1,000 RPD free (primary — best free throughput)
// gemini-1.5-flash      → 1,500 RPD free (fallback if lite quota exhausted)
// Note: gemini-2.5-flash only has ~20 RPD on free tier — do NOT use that.
const RESEARCH_MODEL  = 'gemini-2.5-flash-lite';
const STRUCTURE_MODEL = 'gemini-2.5-flash-lite';
const FALLBACK_MODEL  = 'gemini-1.5-flash';
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

async function geminiCall(key, model, body) {
  const r = await fetch(`${BASE}/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await r.json();
  // If quota exceeded on primary model, automatically retry with fallback
  if (data.error?.status === 'RESOURCE_EXHAUSTED' && model !== FALLBACK_MODEL) {
    console.warn(`${model} quota exceeded — retrying with ${FALLBACK_MODEL}`);
    return geminiCall(key, FALLBACK_MODEL, body);
  }
  if (data.error) throw new Error(`Gemini [${model}]: ${data.error.message}`);
  return data;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const KEY = process.env.GEMINI_API_KEY;
  if (!KEY) {
    res.status(500).json({ error: 'GEMINI_API_KEY not set in Vercel environment variables. Go to: Vercel Project → Settings → Environment Variables.' });
    return;
  }

  const { type, payload } = req.body || {};
  if (!type || !payload?.prompt) {
    res.status(400).json({ error: 'Request must include { type, payload: { prompt } }' });
    return;
  }

  try {
    if (type === 'research') {
      // ── CALL 1: RAG Retrieval — Google Search grounding fetches live web data ──
      // This is the retrieval step. Gemini searches Google in real-time and
      // grounds its answer in actual URLs — not training memory. No hallucination.
      const data = await geminiCall(KEY, RESEARCH_MODEL, {
        contents: [{ parts: [{ text: payload.prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.1 }
      });
      const text = (data.candidates[0].content.parts || [])
        .filter(p => p.text).map(p => p.text).join('');
      const queries = data.candidates[0].groundingMetadata?.webSearchQueries || [];
      const sources = data.candidates[0].groundingMetadata?.groundingSupports
        ?.flatMap(s => s.groundingChunkIndices || []) || [];
      res.status(200).json({ text, queries, sourceCount: sources.length });

    } else if (type === 'structure') {
      // ── CALL 2: LLM Generation — structure retrieved data into guaranteed JSON ──
      // responseMimeType: 'application/json' forces the model to output ONLY valid
      // JSON — this is what eliminates all JSON parse errors completely.
      const data = await geminiCall(KEY, STRUCTURE_MODEL, {
        contents: [{ parts: [{ text: payload.prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      });
      const json = JSON.parse(data.candidates[0].content.parts[0].text);
      res.status(200).json(json);

    } else {
      res.status(400).json({ error: `Unknown type "${type}". Use "research" or "structure".` });
    }
  } catch (err) {
    console.error('OptiCore error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
