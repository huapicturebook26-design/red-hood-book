// 故事頁生成：Gemini 把孩子的話織進小紅帽的故事框架，再由 Kontext 用同一個角色畫出這一頁
const FAL_URL = 'https://fal.run/fal-ai/flux-pro/kontext';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'; // 想換模型，在 Vercel 設定 GEMINI_MODEL
const OKHOST = ['fal.media', 'fal.run', 'fal.ai'];

// 每一頁「一定要發生的事」（小紅帽的骨架）
const SPEC = {
  2: 'The mother gives the child a basket of treats at home and reminds the child to stay on the big path. Setting: cozy cottage doorway, daytime.',
  3: "In the forest, the child meets the wolf. The CHILD'S IDEA decides how the wolf looks, his personality and what he says.",
  4: "On the way, the child reaches a fork in the path where something tempting happens. The CHILD'S IDEA decides what the child does.",
  5: "The child arrives at grandmother's cottage. What happened on page 4 changes the situation. Something is not right: grandmother needs help or is in gentle, non-scary trouble.",
  6: "The trouble reaches its peak and someone comes to help. The CHILD'S IDEA decides WHO helps and HOW (any character is allowed).",
  7: 'The trouble is solved gently. Everyone makes peace, the wolf is forgiven and becomes a friend, and they share the treats from the basket.',
  8: 'Final happy picture: every character who appeared in the story stands together holding hands in a row or circle, the child in the red hooded cape in the middle, everyone smiling.',
};
const SYSTEM = `You are the story editor of an interactive "Little Red Riding Hood" picture book for children aged 3-8 and their parents. Keep the classic frame: a child in a red hooded cape carries a basket of treats through the forest to visit grandmother, meets a wolf, there is a problem at grandmother's house, someone helps, and it ends happily. Follow the "must happen" line for the current page. Weave the child's idea into the HOW / WHO / WHAT without dropping the must-happen line. If the idea is off-theme, turn it into a fun detail (a costume, a decoration, a funny sound) instead of leaving the forest story. Anything violent, scary, sexual or unsafe must be gently rewritten into something kind or funny. Reuse the exact same appearance description for recurring characters. Output JSON only: caption_zh = one warm sentence in Traditional Chinese, at most 24 characters, readable aloud to a child; scene_en = one English sentence describing the picture (setting, action, expressions, which characters are present); cast_en = array of short English appearance descriptions of every non-protagonist character present on this page (empty array if none). Never put text, letters or signs in the picture.`;

const clip = (s, n) => String(s || '').slice(0, n);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.FAL_KEY || !process.env.GEMINI_API_KEY) return res.status(500).json({ error: '伺服器還沒設定 FAL_KEY 或 GEMINI_API_KEY' });
  const code = process.env.ACCESS_CODE;
  if (code && req.headers['x-access-code'] !== code) return res.status(401).json({ error: '需要展場通行碼' });
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  const page = Number(b.page);
  let host = '';
  try { const u = new URL(b.image); host = u.protocol === 'https:' ? u.hostname : ''; } catch (e) {}
  if (!SPEC[page] || !OKHOST.some((h) => host === h || host.endsWith('.' + h))) return res.status(400).json({ error: '參數不正確' });

  const said = clip(b.said, 200);
  const hist = (Array.isArray(b.history) ? b.history : []).slice(0, 7).map((h) => ({ p: Number(h.p), caption: clip(h.caption, 60), cast: (Array.isArray(h.cast) ? h.cast : []).slice(0, 4).map((c) => clip(c, 120)) }));
  const cast = [...new Set(hist.flatMap((h) => h.cast))].slice(0, 8);
  const userMsg =
    `Page ${page} of 8.\nMust happen: ${SPEC[page]}\nChild's idea: ${said || '(none, you decide)'}\n` +
    `Story so far:\n${hist.map((h) => `Page ${h.p}: ${h.caption}`).join('\n') || '(nothing yet)'}\n` +
    `Characters so far (reuse these exact descriptions): ${cast.join(' | ') || '(none)'}` +
    (page === 8 ? '\nInclude ALL characters so far in the final group picture.' : '');

  try {
    const gr = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        generationConfig: {
          temperature: 0.9,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: { caption_zh: { type: 'STRING' }, scene_en: { type: 'STRING' }, cast_en: { type: 'ARRAY', items: { type: 'STRING' } } },
            required: ['caption_zh', 'scene_en', 'cast_en'],
          },
        },
      }),
    }).then((r) => r.json());
    let s;
    try { s = JSON.parse(gr.candidates[0].content.parts[0].text); } catch (e) {
      return res.status(502).json({ error: 'Gemini 沒有回覆，再試一次', detail: gr.error || gr.promptFeedback || null });
    }
    const prompt =
      `The same child in the red hooded cape from the reference image, ${clip(s.scene_en, 500)}. ` +
      `Keep the child's face, hair, skin tone and outfit exactly identical to the reference image. ` +
      (page === 8 ? 'Wide shot, everyone fully visible, the child clearly visible in the middle. ' : 'Medium shot with the child large in the frame and the face clearly visible. ') +
      `Same crayon drawing style with light wash of color, visible waxy crayon strokes, rough paper grain, warm gentle palette. No signature, no stamp, no text`;
    const fr = await fetch(FAL_URL, {
      method: 'POST',
      headers: { Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, image_url: b.image, aspect_ratio: '3:4', output_format: 'jpeg' }),
    }).then((r) => r.json());
    const image = fr && fr.images && fr.images[0] && fr.images[0].url;
    if (!image) return res.status(502).json({ error: '這一頁沒畫出來', detail: fr });
    return res.status(200).json({ image, caption: clip(s.caption_zh, 40), cast: (s.cast_en || []).slice(0, 4).map((c) => clip(c, 120)) });
  } catch (e) {
    return res.status(500).json({ error: '生成時發生錯誤：' + e.message });
  }
};
