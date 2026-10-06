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
const ITEMS = {
  apple: 'red apples', bread: 'bread', flower: 'colorful flowers',
  cake: 'a small cake', berry: 'strawberries', milk: 'a bottle of milk',
};
const list = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);

function buildPrompt({ gender, hair, skin, basket }) {
  const c = HAIRCOLOR[skin];
  const items = basket.length ? basket.map((k) => ITEMS[k]) : [ITEMS.apple, ITEMS.bread];
  const hairText =
    hair === 'long'
      ? gender === 'girl'
        ? `long ${c} wavy hair that flows out from under the hood and hangs in front of both shoulders`
        : `long ${c} hair that hangs down in front of both shoulders on top of the cape, symmetrical on the left and right sides of his face`
      : gender === 'girl'
      ? `short ${c} bob hair peeking out from under the hood`
      : `short ${c} hair peeking out from under the hood`;
  const who =
    gender === 'girl'
      ? `a girl with ${hairText} and ${SKIN[skin]}. She wears the same red hooded cape with the hood up and a light dress, and holds the wicker basket in front of her`
      : `a boy with ${hairText} and ${SKIN[skin]}. Boyish face with thick dark straight eyebrows, plain small black oval eyes, a confident cheerful smile, and a slightly squarer jaw. He wears the red hooded cape with the hood up over a simple light blue shirt and brown shorts, and holds the wicker basket in front of him`;
  return (
    `Redraw the child in the reference image as ${who}. The basket has ${list(items)} in it. ` +
    `Facing the viewer, full body, standing on the forest path, face clearly visible. ` +
    `Crisp clean crayon linework, sharp details, same crayon drawing style with light wash of color, ` +
    `visible waxy crayon strokes, rough paper grain, warm gentle palette. No signature, no stamp, no text`
  );
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.FAL_KEY) return res.status(500).json({ error: '伺服器還沒設定 FAL_KEY' });
  const code = process.env.ACCESS_CODE;
  if (code && req.headers['x-access-code'] !== code) return res.status(401).json({ error: '需要展場通行碼' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  const basket = Array.isArray(b.basket) ? b.basket.filter((k) => ITEMS[k]).slice(0, 3) : [];
  const a = { gender: b.gender, hair: b.hair, skin: b.skin, basket };
  if (!['girl', 'boy'].includes(a.gender) || !['long', 'short'].includes(a.hair) || !SKIN[a.skin]) {
    return res.status(400).json({ error: '選項不完整' });
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const image_url = `https://${host}/base-girl.jpg`;
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
