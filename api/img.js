// 圖片代理：讓列印頁可以把 fal.ai 的圖畫進畫布（避免跨網域限制）
const OKHOST = ['fal.media', 'fal.run', 'fal.ai'];
module.exports = async (req, res) => {
  let host = '';
  try { const u = new URL(req.query.u); host = u.protocol === 'https:' ? u.hostname : ''; } catch (e) {}
  if (!OKHOST.some((h) => host === h || host.endsWith('.' + h))) return res.status(400).send('bad url');
  try {
    const r = await fetch(req.query.u);
    if (!r.ok) return res.status(502).send('upstream error');
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(500).send('error');
  }
};
