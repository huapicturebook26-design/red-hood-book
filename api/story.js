// 小紅帽故事頁生成：用孩子選定的角色圖當參考，畫出一頁故事場景
const FAL_URL = 'https://fal.run/fal-ai/flux-pro/kontext';
const ASPECT = '3:4';
const SCENES = [
  "standing at the wooden door of the child's cozy cottage, smiling and waving goodbye, ready to start the journey",
  'walking toward the viewer along a sunny forest path, smiling',
  'standing on the forest path and meeting a friendly, cute cartoon wolf with a big smile peeking out from behind a tree, the child looks curious and not scared',
  'kneeling in a sunny meadow picking colorful flowers, the basket on the grass beside the child, smiling',
  "standing at the wooden door of the grandmother's small cottage, about to knock, smiling",
  'sitting at a cozy table inside the cottage with a kind smiling grandmother with white hair and glasses, sharing the basket of treats, happy ending',
];
const OKHOST = ['fal.media', 'fal.run', 'fal.ai'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.FAL_KEY) return res.status(500).json({ error: '伺服器還沒設定 FAL_KEY' });
  const code = process.env.ACCESS_CODE;
  if (code && req.headers['x-access-code'] !== code) return res.status(401).json({ error: '需要展場通行碼' });
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  const i = Number(b.scene);
  let host = '';
  try { const u = new URL(b.image); host = u.protocol === 'https:' ? u.hostname : ''; } catch (e) {}
  if (!Number.isInteger(i) || !SCENES[i] || !OKHOST.some((h) => host === h || host.endsWith('.' + h))) {
    return res.status(400).json({ error: '參數不正確' });
  }
  const prompt =
    `The same child in the red hooded cape from the reference image, ${SCENES[i]}. ` +
    `Keep the child's face, hair, skin tone and outfit exactly identical to the reference image. ` +
    `Medium shot with the child large in the frame and the face clearly visible. ` +
    `Same crayon drawing style with light wash of color, visible waxy crayon strokes, rough paper grain, warm gentle palette. No signature, no stamp, no text`;
  try {
    const r = await fetch(FAL_URL, {
      method: 'POST',
      headers: { Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, image_url: b.image, aspect_ratio: ASPECT, output_format: 'jpeg' }),
    }).then((x) => x.json());
    const image = r && r.images && r.images[0] && r.images[0].url;
    if (!image) return res.status(502).json({ error: '這一頁沒畫出來', detail: r });
    return res.status(200).json({ image });
  } catch (e) {
    return res.status(500).json({ error: '生成時發生錯誤：' + e.message });
  }
};
