// 故事頁生成：Gemini（或備用的 MyMemory）把孩子的話織進小紅帽的故事框架，再由 Kontext 用同一個角色畫出這一頁
// 另外：GET /api/page?u=圖片網址 兼任圖片代理，供列印頁使用（不需要另外的 img.js）
const VERSION = 'draw.js v10';
const FAL_URL = 'https://fal.run/fal-ai/flux-pro/kontext';
const MODELS = [...new Set([process.env.GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.5-flash'].filter(Boolean))];
const OKHOST = ['fal.media', 'fal.run', 'fal.ai'];
const okHost = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && OKHOST.some((h) => x.hostname === h || x.hostname.endsWith('.' + h)); } catch (e) { return false; } };

// 固定角色外觀（避免配角被畫成跟主角一樣的紅帽小孩）
const MOTHER = "the child's mother, a tall adult woman with brown hair in a bun, wearing a green dress and a white apron, no hood";
const GRANDMA = 'the grandmother, a small elderly woman with white hair in a bun, round glasses, a gray shawl and a purple dress, no hood';
const HUNTER = 'a kind hunter, a tall adult man with a brown beard, a green hat and a brown coat';
const WOLF = 'a gray cartoon wolf with a friendly face';

// 每一頁「一定要發生的事」（依作者的腳本）
const SPEC = {
  2: "At home. The mother stands at the cottage door and, with a caring face, asks the child to visit her grandmother who is feeling a little unwell; she hands over the basket of treats and reminds the child to be careful on the way.",
  3: "In the forest the child is picking a few flowers to bring to grandmother. Suddenly a wolf walks toward her. The CHILD'S IDEA is what the wolf says to her: let it decide the wolf's expression and body language (friendly, sneaky, funny, shy...). The wolf is a cartoon wolf, not scary.",
  4: "The child kindly gives the wolf some food from her basket, tells him she will visit grandmother by herself and says goodbye, waving. The wolf stays behind. The CHILD'S IDEA is what the wolf is thinking or planning: show it through his expression, pose and a small hint in the scene (for example looking toward a shortcut).",
  5: "The child arrives at grandmother's front door and finds the door wide open, which feels strange and worrying. She has decided to ask the CHILD'S IDEA character (any person, animal or creature the child named) for help, and that helper stands right next to her. Nobody else is visible, the wolf and grandmother are not shown.",
  6: "The child and her helper step into the cottage and see the wolf and grandmother. It is not what they expected: the wolf and grandmother are happily doing the CHILD'S IDEA activity together. The child and helper look surprised, the wolf and grandmother look cheerful. Nothing scary.",
  7: "Everybody joins in: the wolf, grandmother, the helper and the child all happily do the CHILD'S IDEA activity (the same one as the previous page) together, laughing.",
  8: 'Final quiet picture: the main child seen from behind, walking away along the winding forest path toward the sunset, carrying the basket.',
};
// 每一頁的鏡頭語言（打破「角色永遠站正中間」）
const CAM = {
  2: 'Wide establishing shot from a low angle outside the cottage: the mother stands in the doorway on the right handing over the basket, the child stands on the left third of the frame in three-quarter view, the cottage and the winding path fill the background.',
  3: 'Wide forest shot with depth: the child is small on the left third, bending to pick flowers, flowers in the foreground; the wolf walks toward her from the right middle distance between the trees.',
  4: 'Two-part composition: the child walks away along the path in the lower-left foreground, waving back; the wolf stands in the right background, looking after her with a thoughtful expression.',
  5: "Low-angle wide shot in front of grandmother's cottage: the wooden front door stands wide open at the center-right; the child is on the left third looking at it with a worried face, her helper standing right beside her.",
  6: 'Interior wide shot from the doorway looking in: the wolf and grandmother are busy at the right and center of the room; the child and her helper are small in the left foreground with surprised faces.',
  7: 'Medium-wide shot, slightly high angle, inside the cottage: everyone is spread around the room joining in together; the child is not in the center.',
  8: 'Wide shot from behind: the child seen from the back walking away along a winding forest path toward a glowing sunset, small in the lower-left third of the frame, trees framing both sides.',
};
const SYSTEM = `You are the story editor of an interactive "Little Red Riding Hood" picture book for children aged 3-8 and their parents. The story script is fixed by the author; follow the "must happen" line for the current page exactly and use the child's idea only for the part the line says it decides. If the idea is off-theme, turn it into a fun, kind detail. Anything violent, scary, sexual or unsafe must be gently rewritten into something kind or funny. Reuse the exact same appearance description for recurring characters (the story so far lists them). Think like a picture-book director: use the camera suggestion and adapt it; never place the child in the center of every picture. Output JSON only: caption_zh = a very short Traditional Chinese label (at most 12 characters, it is not shown); scene_en = one or two English sentences describing the action and expressions in the picture, naming every object, animal and character concretely; camera_en = one English sentence about shot, angle and composition; cast_en = array of short English appearance descriptions of every non-protagonist character present on this page (empty array if none; the helper and wolf and grandmother each need a description). Never put text, letters, signs or speech bubbles in the picture. Only the main child wears a red hood; every other character must have different clothes and look clearly different from the child. When these characters appear, use these exact descriptions: mother = ${MOTHER}; grandmother = ${GRANDMA}; hunter = ${HUNTER}; wolf = ${WOLF} (unless the child described the wolf differently).`;
const clip = (s, n) => String(s || '').slice(0, n);

async function viaGemini(userMsg) {
  let last;
  for (const m of MODELS) {
    try { return await callGemini(m, userMsg); } catch (e) {
      last = e;
      if (!/404|not found|no longer available|NOT_FOUND/i.test(String(e.message))) throw e; // 只有「模型不存在」才換下一個
    }
  }
  throw last;
}
async function callGemini(model, userMsg) {
  const gr = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    signal: AbortSignal.timeout(12000),
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: userMsg }] }],
      generationConfig: {
        temperature: 0.9,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: { caption_zh: { type: 'STRING' }, scene_en: { type: 'STRING' }, camera_en: { type: 'STRING' }, cast_en: { type: 'ARRAY', items: { type: 'STRING' } } },
          required: ['caption_zh', 'scene_en', 'camera_en', 'cast_en'],
        },
      },
    }),
  }).then((r) => r.json());
  if (gr.error) throw new Error(`${gr.error.code || ''} ${gr.error.message || ''}`);
  const txt = gr.candidates && gr.candidates[0] && gr.candidates[0].content && gr.candidates[0].content.parts && gr.candidates[0].content.parts[0].text;
  if (!txt) throw new Error('沒有回覆 ' + JSON.stringify(gr.promptFeedback || gr.candidates || '').slice(0, 100));
  const o = JSON.parse(txt);
  if (!o.scene_en || !o.caption_zh) throw new Error('回覆內容不完整');
  return o;
}

// 備用方案：MyMemory 免費翻譯 + 固定劇情模板（Gemini 不能用時自動啟動）
const BAD = /殺|死|血|打架|打人|咬|吃掉|吞|槍|刀|炸|火|毒|裸|色/;
async function tr(text) {
  try {
    const email = process.env.MYMEMORY_EMAIL ? `&de=${encodeURIComponent(process.env.MYMEMORY_EMAIL)}` : '';
    const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 150))}&langpair=zh-TW|en${email}`, { signal: AbortSignal.timeout(5000) }).then((x) => x.json());
    const t = r && r.responseData && r.responseData.translatedText;
    if (t && Number(r.responseStatus) === 200 && !/MYMEMORY WARNING/i.test(t)) return t;
  } catch (e) {}
  return '';
}
const KW = [
  [/媽媽|媽咪|母親/, MOTHER], [/外婆|奶奶|婆婆/, GRANDMA], [/獵人/, HUNTER],
  [/小鳥|鳥/, 'a small blue bird'], [/小動物|動物/, 'a rabbit, a squirrel and a deer'], [/花/, 'many colorful flowers'],
  [/蝴蝶/, 'colorful butterflies'], [/彩虹/, 'a big rainbow in the sky'], [/兔/, 'a white rabbit'], [/蛋糕/, 'a cake'],
  [/外星/, 'three cute little green and blue aliens'], [/恐龍/, 'a friendly cartoon dinosaur'], [/龍/, 'a friendly cartoon dragon'],
];
const NONCHAR = ['many colorful flowers', 'colorful butterflies', 'a big rainbow in the sky', 'a cake'];
const noSpeech = (t) => t.replace(/[，,。\s]*(他|牠|它|她)?對.{0,8}(說|講|問|喊|叫).*$/, '');
async function fallback(page, said, cast) {
  const z0 = BAD.test(said) ? '' : said.replace(/[。！!？?]+$/, '');
  const z = page === 3 ? (noSpeech(z0) || z0) : z0;
  const zs = z.replace(/^(小紅帽|她|他|牠)[，,]?/, '');
  const x = z ? (await tr(z)).replace(/["“”‘’]/g, '') : '';
  const extra = KW.filter(([re]) => re.test(z)).map(([, d]) => d);
  const people = extra.filter((d) => !NONCHAR.includes(d));
  const withExtra = (t) => t + (extra.length ? '. Clearly shown in the picture: ' + extra.join('; ') : '');
  const wolf = cast.find((c) => /wolf/i.test(c)) || WOLF;
  const everyone = cast.length ? cast : [wolf, GRANDMA];
  const soft = ' Keep everything gentle, friendly and child-friendly.';
  const T = {
    2: [`at the wooden door of a cozy cottage, ${MOTHER} hands the child a wicker basket of treats and speaks to her kindly, the child listens and smiles`, '', [MOTHER]],
    3: [withExtra(`in the forest the child picks flowers while a wolf walks toward her, looking friendly and curious as if he is talking to her, not scary`), '', [`a cartoon wolf, ${x ? 'gray fur' : 'friendly face, gray fur'}`]],
    4: [withExtra(`the child hands some food from her basket to the wolf and waves goodbye; the wolf stays behind with a thoughtful face, thinking: ${x || 'what to do next'}`), '', [wolf]],
    5: [withExtra(`the child stands at the wide open front door of grandmother's cottage looking worried; ${x ? 'her helper, ' + x + ',' : 'a kind helper'} stands right beside her`), '', people.length ? people : [x ? `a friendly helper: ${x}` : 'a kind small helper']],
    6: [`inside the cottage, the wolf and grandmother are happily ${x || 'having fun together'} while the child and her helper watch in surprise`, '', [...new Set([...cast.filter((c) => !/wolf/i.test(c) && !/grandmother/i.test(c)), wolf, GRANDMA])]],
    7: [`inside the cottage, ${everyone.join('; ')} all happily ${x || 'play together'} with the child, laughing`, '', everyone],
    8: ['the main child seen from behind, walking away along the forest path toward the sunset, carrying the basket', '', []],
  }[page];
  return { scene_en: T[0] + '.' + soft, camera_en: CAM[page], caption_zh: T[1], cast_en: T[2] };
}

module.exports = async (req, res) => {
  // 圖片代理（GET）
  if (req.method === 'GET') {
    if (!req.query.u) return res.status(200).send(VERSION); // 打開 /api/page 可確認伺服器版本
    if (!okHost(req.query.u)) return res.status(400).send('bad url');
    try {
      const r = await fetch(req.query.u);
      if (!r.ok) return res.status(502).send('upstream error');
      res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(200).send(Buffer.from(await r.arrayBuffer()));
    } catch (e) { return res.status(500).send('error'); }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.FAL_KEY) return res.status(500).json({ error: '伺服器還沒設定 FAL_KEY' });
  const code = process.env.ACCESS_CODE;
  if (code && req.headers['x-access-code'] !== code) return res.status(401).json({ error: '需要展場通行碼' });
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  const page = Number(b.page);
  if (!SPEC[page] || !okHost(b.image)) return res.status(400).json({ error: '參數不正確' });

  const said = clip(b.said, 200);
  const hist = (Array.isArray(b.history) ? b.history : []).slice(0, 7).map((h) => ({ p: Number(h.p), caption: clip(h.caption, 200), said: clip(h.said, 100), cast: (Array.isArray(h.cast) ? h.cast : []).slice(0, 5).map((c) => clip(c, 160)) }));
  const cast = [...new Set(hist.flatMap((h) => h.cast))].slice(0, 8);
  const userMsg =
    `Page ${page} of 8.\nMust happen: ${SPEC[page]}\nCamera suggestion: ${CAM[page]}\nChild's idea: ${said || '(none, you decide)'}\n` +
    `Story so far:\n${hist.map((h) => `Page ${h.p}: ${h.caption}${h.said ? ' (child said: ' + h.said + ')' : ''}`).join('\n') || '(nothing yet)'}\n` +
    `Characters so far (reuse these exact descriptions): ${cast.join(' | ') || '(none)'}` +
    (page === 8 ? '\nInclude ALL characters so far in the final group picture.' : '');

  try {
    let sc = null, mode = 'gemini', gerr = '';
    if (page === 8) { mode = 'fixed'; sc = { caption_zh: '小紅帽開心地走向回家的路。', scene_en: SPEC[8].replace(/^Final quiet picture: /, '').replace(/\.$/, '') + '. Gentle and peaceful', camera_en: CAM[8], cast_en: [] }; }
    else if (!process.env.GEMINI_API_KEY) gerr = '沒有設定 GEMINI_API_KEY';
    else { try { sc = await viaGemini(userMsg); } catch (e) { gerr = clip(e.message || e, 160); } }
    if (!sc) { mode = 'mymemory'; sc = await fallback(page, said, cast); }
    const chars = (Array.isArray(sc.cast_en) ? sc.cast_en : []).slice(0, 5).map((c) => clip(c, 160));
    // 沿用 Playground 實測有效的簡潔寫法
    const prompt =
      `Keep the child in the red hooded cape exactly the same (face, hair, skin tone, outfit). Do not copy the centered pose. ` +
      `New scene: ${clip(sc.scene_en, 600).replace(/[.\s]+$/, '')}. ` +
      `${clip(sc.camera_en || CAM[page], 400).replace(/[.\s]+$/, '')}. ` +
      (chars.length
        ? `Add only ${chars.join('; ')} as other characters, clearly different from the child, with no red hood, and nobody else. `
        : 'No other characters. ') +
      `Same crayon drawing style, no text, no letters, no speech bubbles.`;
    let fr, fstatus = 0;
    try {
      const resp = await fetch(FAL_URL, {
        method: 'POST',
        signal: AbortSignal.timeout(48000),
        headers: { Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, image_url: b.image, aspect_ratio: '3:4', output_format: 'jpeg' }),
      });
      fstatus = resp.status;
      const txt = await resp.text();
      try { fr = JSON.parse(txt); } catch (e) { fr = { raw: clip(txt, 200) }; }
    } catch (e) {
      return res.status(504).json({ error: '畫圖等太久了（' + (e.name || 'timeout') + '），請按「重畫」', mode, gerr });
    }
    const image = fr && fr.images && fr.images[0] && fr.images[0].url;
    if (!image) {
      const why = typeof fr.detail === 'string' ? fr.detail : JSON.stringify(fr.detail || fr.raw || fr).slice(0, 200);
      return res.status(502).json({ error: '畫圖服務回應 ' + fstatus + '：' + clip(why, 160), mode, gerr });
    }
    return res.status(200).json({ image, mode, gerr: mode === 'gemini' ? '' : gerr, caption: clip(sc.caption_zh, 40), cast: chars });
  } catch (e) {
    return res.status(500).json({ error: '生成時發生錯誤：' + e.message });
  }
};
