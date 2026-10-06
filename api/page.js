// 故事頁生成：Gemini（或備用的 MyMemory）把孩子的話織進小紅帽的故事框架，再由 Kontext 用同一個角色畫出這一頁
// 另外：GET /api/page?u=圖片網址 兼任圖片代理，供列印頁使用（不需要另外的 img.js）
const VERSION = 'page.js v8';
const FAL_URL = 'https://fal.run/fal-ai/flux-pro/kontext';
const MODELS = [...new Set([process.env.GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.5-flash'].filter(Boolean))];
const OKHOST = ['fal.media', 'fal.run', 'fal.ai'];
const okHost = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && OKHOST.some((h) => x.hostname === h || x.hostname.endsWith('.' + h)); } catch (e) { return false; } };

// 固定角色外觀（避免配角被畫成跟主角一樣的紅帽小孩）
const MOTHER = "the child's mother, a tall adult woman with brown hair in a bun, wearing a green dress and a white apron, no hood";
const GRANDMA = 'the grandmother, a small elderly woman with white hair in a bun, round glasses, a gray shawl and a purple dress, no hood';
const HUNTER = 'a kind hunter, a tall adult man with a brown beard, a green hat and a brown coat';
const WOLF = 'a gray cartoon wolf with a friendly face';

// 每一頁「一定要發生的事」（小紅帽的骨架）
const SPEC = {
  2: 'The mother gives the child a basket of treats at home and reminds the child to stay on the big path.',
  3: "In the forest, the child meets the wolf. The CHILD'S IDEA decides how the wolf looks, his personality and what he says.",
  4: "On the way, the child reaches a fork in the path where something tempting happens. The CHILD'S IDEA decides what the child does.",
  5: "The child enters grandmother's cottage and finds the wolf lying in grandmother's bed wearing grandmother's nightcap; the WOLF is the main subject of the picture. Grandmother is not visible (she is hiding in the wardrobe, which shakes gently). The child is surprised and realizes help is needed.",
  6: "The child runs to the door and calls for help. Helpers come running from far away OUTSIDE along the path (never from inside the house), then they all go in and free grandmother from the wardrobe together. The CHILD'S IDEA decides WHO helps and HOW (any character is allowed).",
  7: 'Everything is solved gently. Grandmother is safe, the wolf says sorry and is forgiven and becomes a friend, and everyone shares the treats from the basket.',
  8: 'Final quiet picture: the main child seen from behind, walking away along the winding forest path toward the sunset, carrying the basket.',
};
// 每一頁的鏡頭語言（打破「角色永遠站正中間」）
const CAM = {
  2: 'Wide establishing shot from a low angle outside the cottage: the mother stands in the doorway on the right handing over the basket, the child stands on the left third of the frame in three-quarter view, the cottage and the winding path fill the background.',
  3: 'Over-the-shoulder low-angle shot: the wolf is large in the right foreground peeking out from behind a big tree, the child is small on the left third of the frame looking up at him with curious eyes, deep forest behind.',
  4: 'Wide shot with strong depth: a winding forest path, the child small in the lower-left third running along it seen in three-quarter view, flowers in the foreground, anything the child follows flying ahead near the upper right.',
  5: "Interior wide shot from the bedroom doorway: the wolf in grandmother's nightcap lies in the bed at the center-right and is the main subject; the child is small at the left edge near the door with hands on cheeks, surprised; a sunny window behind the bed, a wooden wardrobe in the corner.",
  6: 'Dynamic diagonal composition, slightly high angle: the child stands at the open front door on the left with hands cupped around the mouth, calling out; the helpers are small figures running toward the house along the winding path from far away on the right side of the frame (they come from outside, never from inside the house); a little of the bedroom with the wolf in bed is visible behind the child.',
  7: 'Medium-wide shot, slightly high angle, around a round wooden table inside the cottage: grandmother, the wolf and the helpers sit at different positions, the child sits on the left sharing treats; the child is not centered.',
  8: 'Wide shot from behind: the child seen from the back walking away along a winding forest path toward a glowing sunset, small in the lower-left third of the frame, trees framing both sides.',
};
const SYSTEM = `You are the story editor of an interactive "Little Red Riding Hood" picture book for children aged 3-8 and their parents. Keep the classic frame: a child in a red hooded cape carries a basket of treats through the forest to visit grandmother, meets a wolf, finds the wolf in grandmother's bed, calls for help, someone helps, and it ends happily. Follow the "must happen" line for the current page. Weave the child's idea into the HOW / WHO / WHAT without dropping the must-happen line. If the idea is off-theme, turn it into a fun detail (a costume, a decoration, a funny sound) instead of leaving the forest story. Anything violent, scary, sexual or unsafe must be gently rewritten into something kind or funny. Reuse the exact same appearance description for recurring characters. Think like a picture-book director: use the camera suggestion (shot size, angle, who is the main subject, where the child stands) and adapt it; never place the child in the center of every picture. Output JSON only: caption_zh = one warm sentence in Traditional Chinese, at most 24 characters, readable aloud to a child; scene_en = one or two English sentences describing the action and expressions; camera_en = one English sentence about shot, angle and composition; cast_en = array of short English appearance descriptions of every non-protagonist character present on this page (empty array if none). Never put text, letters or signs in the picture. Name every object, animal and character the child mentioned concretely (for example: five pink flowers, a small blue bird flying ahead). Only the main child wears a red hood; every other character must have different clothes and look clearly different from the child. When these characters appear, use these exact descriptions: mother = ${MOTHER}; grandmother = ${GRANDMA}; hunter = ${HUNTER}; wolf = ${WOLF} (unless the child described the wolf differently).`;

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
    const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 150))}&langpair=zh-TW|en${email}`).then((x) => x.json());
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
    2: [`at the wooden door of a cozy cottage, ${MOTHER} hands the child a wicker basket of treats and points to the big path, the child smiles`, '媽媽說：走大路，不要亂跑喔！', [MOTHER]],
    3: [`in the forest, the child meets a wolf: ${x || 'a friendly cute cartoon wolf'}. The wolf looks friendly and funny, not scary`, z ? `森林裡，小紅帽遇見了${z.replace(/^(他|牠|它)是/, '')}。` : '森林裡，小紅帽遇見了一隻友善的大野狼。', [`a cartoon wolf, ${x || 'friendly face, gray fur'}`]],
    4: [withExtra(`on the way through the forest, the child ${x || 'follows the path'}`), z ? `小紅帽${zs}。` : '小紅帽繼續沿著小路往前走。', people],
    5: [`inside grandmother's bedroom, ${wolf} wearing grandmother's nightcap lies in grandmother's bed looking sleepy and a little silly, the child has just entered and is surprised, a wooden wardrobe in the corner shakes gently`, '進到外婆家，床上躺著戴睡帽的大野狼！', [wolf]],
    6: [withExtra(`the child stands at the open front door of grandmother's cottage and calls loudly for help; ${x || 'a kind helper'} comes running from far away along the path, from outside and not from inside the house; together they free grandmother from the wardrobe`), z ? `小紅帽大聲求救，${zs}！` : '小紅帽大聲求救，有人趕來幫忙了！', [...new Set([...people, wolf, GRANDMA])]],
    7: [`inside grandmother's cozy cottage, ${everyone.join('; ')} sit around a wooden table with the child, sharing the basket of treats, the wolf looks sorry and is forgiven`, '外婆平安出來了，大家和好，一起分享點心。', everyone],
    8: ['the main child seen from behind, walking away along the forest path toward the sunset, carrying the basket', '小紅帽開心地走向回家的路。', []],
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
  const hist = (Array.isArray(b.history) ? b.history : []).slice(0, 7).map((h) => ({ p: Number(h.p), caption: clip(h.caption, 60), cast: (Array.isArray(h.cast) ? h.cast : []).slice(0, 5).map((c) => clip(c, 160)) }));
  const cast = [...new Set(hist.flatMap((h) => h.cast))].slice(0, 8);
  const userMsg =
    `Page ${page} of 8.\nMust happen: ${SPEC[page]}\nCamera suggestion: ${CAM[page]}\nChild's idea: ${said || '(none, you decide)'}\n` +
    `Story so far:\n${hist.map((h) => `Page ${h.p}: ${h.caption}`).join('\n') || '(nothing yet)'}\n` +
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
    const fr = await fetch(FAL_URL, {
      method: 'POST',
      headers: { Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, image_url: b.image, aspect_ratio: '3:4', output_format: 'jpeg' }),
    }).then((r) => r.json());
    const image = fr && fr.images && fr.images[0] && fr.images[0].url;
    if (!image) return res.status(502).json({ error: '這一頁沒畫出來', detail: fr });
    return res.status(200).json({ image, mode, gerr: mode === 'gemini' ? '' : gerr, caption: clip(sc.caption_zh, 40), cast: chars });
  } catch (e) {
    return res.status(500).json({ error: '生成時發生錯誤：' + e.message });
  }
};
