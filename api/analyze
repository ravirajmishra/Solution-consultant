export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) { res.status(500).json({ error: 'GEMINI_API_KEY not configured in Vercel environment variables' }); return; }

  const { type, payload } = req.body;

  try {
    if (type === 'research') {
      // Call 1: Google Search grounded research
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: payload.prompt }] }],
            tools: [{ google_search: {} }],
            generationConfig: { temperature: 0.1 }
          })
        }
      );
      const data = await r.json();
      if (data.error) throw new Error(data.error.message);
      const text = (data.candidates[0].content.parts || [])
        .filter(p => p.text).map(p => p.text).join('');
      const queries = data.candidates[0].groundingMetadata?.webSearchQueries || [];
      res.status(200).json({ text, queries });

    } else if (type === 'structure') {
      // Call 2: Guaranteed JSON output
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: payload.prompt }] }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json'
            }
          })
        }
      );
      const data = await r.json();
      if (data.error) throw new Error(data.error.message);
      const json = JSON.parse(data.candidates[0].content.parts[0].text);
      res.status(200).json(json);

    } else {
      res.status(400).json({ error: 'Invalid request type. Use "research" or "structure".' });
    }
  } catch (err) {
    console.error('OptiCore API error:', err);
    res.status(500).json({ error: err.message });
  }
}
