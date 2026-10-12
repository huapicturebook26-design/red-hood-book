// 小紅帽角色生成：把孩子的選項組成提示詞，呼叫 fal.ai 的 FLUX.1 Kontext [pro]
const FAL_URL = 'https://fal.run/fal-ai/flux-pro/kontext';
const ASPECT = '3:4'; // 直式，之後印成小書每頁的比例。想維持正方形可改成 '1:1'

const SKIN = {
  fair: 'fair light skin',
  tan: 'light warm tan skin',
  brown: 'clearly warm medium-brown skin, noticeably darker than the reference image',
  deep: 'deep brown skin',
};
const HAIRCOLOR = { fair: 'light brown', tan: 'brown', brown: 'dark brown', deep: 'dark black' };
const COLOR = { blue: 'blue', yellow: 'yellow', pink: 'pink', green: 'green' };
const TOP = {}; for (const k in COLOR) { TOP[k + '_s'] = `${COLOR[k]} short-sleeved shirt`; TOP[k + '_l'] = `${COLOR[k]} long-sleeved shirt`; }
const BOTTOM = { shorts: 'black shorts', pants: 'long black trousers', flare: 'bell-bottom flared trousers', jeans: 'blue jeans', aline: 'an A-line skirt', tutu: 'a puffy tutu skirt' };
const HAIR = ['long', 'braid', 'pony', 'twin', 'buzz', 'bob', 'curl', 'short'];
function buildPrompt({ gender, hair, skin, top, bottom }) {
  const c = HAIRCOLOR[skin];
  const g = gender === 'girl';
  const back = 'The red hood is pushed back and rests on the shoulders so the hairstyle is fully visible. ';
  const H = {
    long: `very long ${c} hair that falls past the shoulders and hangs in front of both shoulders over the cape, symmetrical on both sides of the face`,
    braid: `${c} hair in two neat braids that hang in front of both shoulders over the cape`,
    pony: `${c} hair tied up in one ponytail that swings behind the head`,
    twin: `${c} hair tied in two pigtails, one on each side of the head, hanging down`,
    buzz: `a very short ${c} buzz cut, close-cropped hair`,
    bob: `a ${c} chin-length bob haircut with straight bangs`,
    curl: `short ${c} hair with the ends curling inward, a neat inward-curled short cut`,
    short: `short ${c} hair`,
  }[hair];
  const hoodNote = hair === 'long' ? '' : back;
  const topT = TOP[top] || (g ? 'light blue short-sleeved shirt' : 'light blue short-sleeved shirt');
  const botT = BOTTOM[bottom] || (g ? 'an A-line skirt' : 'brown shorts');
  const clothes = `Under the red cape she/he wears a ${topT} and ${botT}; the cape hangs open at the front so the whole outfit, the sleeves and the legs are clearly visible`.replace('she/he', g ? 'she' : 'he');
  const who = g
    ? `a girl with ${H} and ${SKIN[skin]}. ${hoodNote}She wears the same red hooded cape. ${clothes}. She holds the wicker basket in front of her`
    : `a boy with ${H} and ${SKIN[skin]}. Boyish face with thick, bold, dark sword-shaped eyebrows (strong straight angled brows), plain small black oval eyes with NO eyelashes at all, a confident cheerful smile, and a slightly squarer jaw. ${hoodNote}He wears the same red hooded cape. ${clothes}. He holds the wicker basket in front of him`;
  return (
    `Redraw the child in the reference image as ${who}. The basket holds a few apples and bread. ` +
    `Facing the viewer, full body, standing on the forest path, face clearly visible. ` +
    `Crisp clean crayon linework, sharp details, same crayon drawing style with light wash of color, ` +
    `visible waxy crayon strokes, rough paper grain, warm gentle palette. No signature, no stamp, no text`
  );
}

const normCode = s => String(s||'').normalize('NFKC').trim().toLowerCase();
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.FAL_KEY) return res.status(500).json({ error: '伺服器還沒設定 FAL_KEY' });
  const code = process.env.ACCESS_CODE;
  if (code && normCode(req.headers['x-access-code']) !== normCode(code)) return res.status(401).json({ error: '通行碼不對（伺服器收到 '+String(req.headers['x-access-code']||'').length+' 個字，應為 '+String(code).trim().length+' 個字）' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  if (b.check) return res.status(200).json({ ok: true });
  const a = { gender: b.gender, hair: b.hair, skin: b.skin, top: b.top, bottom: b.bottom };
  if (!['girl', 'boy'].includes(a.gender) || !HAIR.includes(a.hair) || !SKIN[a.skin]) {
    return res.status(400).json({ error: '選項不完整' });
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  let image_url = `https://${host}/base-girl.jpg`;
  for (const n of ['base-girl.jpg', 'base-girl.JPG']) { // 大小寫都接受
    try {
      const h = await fetch(`https://${host}/${n}`, { method: 'HEAD' });
      if (h.ok) { image_url = `https://${host}/${n}`; break; }
    } catch (e) {}
  }
  const prompt = buildPrompt(a);
  const call = () =>
    fetch(FAL_URL, {
      method: 'POST',
      headers: { Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, image_url, aspect_ratio: ASPECT, output_format: 'jpeg' }),
    }).then((r) => r.json());

  try {
    const results = await Promise.all([call(), call()]); // 一次畫兩張，讓孩子挑
    const images = results.map((r) => r && r.images && r.images[0] && r.images[0].url).filter(Boolean);
    if (!images.length) return res.status(502).json({ error: '這次沒畫出來，再試一次', detail: results[0] });
    return res.status(200).json({ images, prompt });
  } catch (e) {
    return res.status(500).json({ error: '生成時發生錯誤：' + e.message });
  }
};
