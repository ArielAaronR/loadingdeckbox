// Order artwork store: the customer's skins ZIP arrives in chunks (Netlify Functions accept ~6 MB per
// request), gets sealed once the order is sent, and the shop owner downloads it from the link in the
// order email. `store` is a Netlify Blobs store (or a test double with get/set/setJSON/list).
//
//   PUT  /api/artwork?order=<uuid>&part=<n>           body: one chunk (≤ 4 MB)
//   POST /api/artwork?order=<uuid>&parts=<n>&name=<f>  seal the order (no more uploads)
//   GET  /api/artwork?order=<uuid>                     download page (reassembles the ZIP in the browser)
//   GET  /api/artwork?order=<uuid>&meta=1              {parts, name, size, created}
//   GET  /api/artwork?order=<uuid>&part=<n>            one chunk
export const CHUNK_MAX = 4 * 1024 * 1024;
export const MAX_PARTS = 40;                       // 160 MB per order
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const text = (body, status = 200, type = 'text/plain; charset=utf-8') =>
  new Response(status === 204 ? null : body, { status, headers: { 'content-type': type, 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
const partNo = (v, max) => (/^\d{1,3}$/.test(v || '') && +v < max ? +v : -1);

export async function handle(req, store) {
  const url = new URL(req.url), q = url.searchParams, id = q.get('order') || '';
  if (!ID.test(id)) return text('Unknown order.', 400);
  const meta = await store.get(`${id}/meta`, { type: 'json' });

  if (req.method === 'PUT') {
    if (meta) return text('This order is already sent.', 409);
    const n = partNo(q.get('part'), MAX_PARTS); if (n < 0) return text('Bad part number.', 400);
    if (+(req.headers.get('content-length') || 0) > CHUNK_MAX) return text('Chunk too large.', 413);
    const buf = await req.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > CHUNK_MAX) return text('Chunk too large or empty.', 413);
    await store.set(`${id}/${n}`, buf);
    return text('', 204);
  }

  if (req.method === 'POST') {
    if (meta) return text('This order is already sent.', 409);
    const parts = partNo(q.get('parts'), MAX_PARTS + 1); if (parts < 1) return text('Bad part count.', 400);
    const name = (q.get('name') || 'artwork.zip').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);
    const { blobs } = await store.list({ prefix: `${id}/` });
    const have = new Set(blobs.map(b => b.key));
    for (let k = 0; k < parts; k++) if (!have.has(`${id}/${k}`)) return text(`Part ${k} is missing.`, 400);
    const size = +(q.get('size') || 0) || null;
    await store.setJSON(`${id}/meta`, { parts, name, size, created: new Date().toISOString() });
    return text(JSON.stringify({ ok: true }), 200, 'application/json');
  }

  if (req.method === 'GET') {
    if (!meta) return text('No artwork for this order.', 404);
    if (q.has('meta')) return text(JSON.stringify(meta), 200, 'application/json');
    if (q.has('part')) {
      const n = partNo(q.get('part'), meta.parts); if (n < 0) return text('Bad part number.', 400);
      const buf = await store.get(`${id}/${n}`, { type: 'arrayBuffer' });
      if (!buf) return text('Missing part.', 404);
      return new Response(buf, { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' } });
    }
    return text(downloadPage(id, meta), 200, 'text/html; charset=utf-8');
  }
  return text('Method not allowed.', 405);
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function downloadPage(id, meta) {
  const mb = meta.size ? ` · ${(meta.size / 1048576).toFixed(1)} MB` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Order artwork</title>
<style>:root{--bg:#e8f1f2;--panel:#f4f9f9;--line:#c3d6d9;--fg:#021927;--muted:#3c5e66;--accent:#0a76a1;--ink:#fff;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#000b13;--panel:#021927;--line:#0b3a52;--fg:#d1ebea;--muted:#7fadb3;--accent:#1cb2d1;--ink:#00121c;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;padding:16px}
main{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:22px;max-width:420px;width:100%}
h1{font-size:18px;margin:0 0 4px}p{margin:0 0 14px;color:var(--muted)}code{font-size:13px}
button{background:var(--accent);color:var(--ink);border:0;border-radius:8px;padding:10px 16px;font:600 14px system-ui,sans-serif;cursor:pointer}
button:disabled{opacity:.6;cursor:default}#st{margin-top:12px;font-size:13px;color:var(--muted)}</style></head>
<body><main><h1>Order artwork</h1><p><code>${esc(meta.name)}</code>${esc(mb)}<br>Sent ${esc(meta.created.slice(0, 16).replace('T', ' '))} UTC</p>
<button id="go">Download ZIP</button><div id="st" role="status"></div></main>
<script>
const id=${JSON.stringify(id)}, meta=${JSON.stringify({ parts: meta.parts, name: meta.name })}, st=document.getElementById('st'), go=document.getElementById('go');
go.onclick=async()=>{ go.disabled=true; const chunks=[];
  try{ for(let k=0;k<meta.parts;k++){ st.textContent='Downloading part '+(k+1)+' of '+meta.parts+'…';
      const r=await fetch('?order='+id+'&part='+k); if(!r.ok) throw new Error('Part '+(k+1)+' failed ('+r.status+')'); chunks.push(await r.arrayBuffer()); }
    const url=URL.createObjectURL(new Blob(chunks,{type:'application/zip'})); const a=document.createElement('a'); a.href=url; a.download=meta.name; document.body.append(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000); st.textContent='Saved '+meta.name+'.';
  }catch(e){ st.textContent=e.message+'. Try again.'; } go.disabled=false; };
</script></body></html>`;
}
