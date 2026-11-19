// Order artwork function (netlify/lib/artwork-core.mjs) against an in-memory store. No browser needed.
const fakeStore=require('./fake_blobs');
const res=[]; const t=async(n,f)=>{ let r; try{ r=await f(); }catch(e){ r=e.message; } const ok=r===true; res.push(ok); console.log((ok?'PASS ':'FAIL ')+n+(ok?'':' — '+r)); };
(async()=>{ const {handle,CHUNK_MAX,MAX_PARTS}=await import('../netlify/lib/artwork-core.mjs');
  const store=fakeStore(), id='0f8fad5b-d9cb-469f-a165-70867728950e', U=q=>`https://shop.example/api/artwork?order=${id}${q}`;
  const call=(method,q,body)=>handle(new Request(U(q),{method,body}),store);
  const A=new Uint8Array(1000).fill(7), B=new Uint8Array(500).fill(9);

  await t('Rejects a malformed order id', async()=> (await handle(new Request('https://x/api/artwork?order=../../etc'),store)).status===400 || 'accepted');
  await t('Unknown order: 404 before it is sent', async()=> (await call('GET','')).status===404 || 'not 404');
  await t('Accepts chunks', async()=> (await call('PUT','&part=0',A)).status===204 && (await call('PUT','&part=1',B)).status===204 || 'chunk refused');
  await t('Refuses a bad part number and an empty chunk', async()=> (await call('PUT',`&part=${MAX_PARTS}`,A)).status===400 && (await call('PUT','&part=x',A)).status===400 && (await call('PUT','&part=2',new Uint8Array(0))).status===413 || 'accepted');
  await t('Refuses an oversized chunk', async()=> (await call('PUT','&part=3',new Uint8Array(CHUNK_MAX+1))).status===413 || 'accepted');
  await t('Sealing checks every part is there', async()=> (await call('POST','&parts=3&name=a.zip')).status===400 || 'sealed with a missing part');
  await t('Seals the order', async()=> (await call('POST','&parts=2&size=1500&name=Order%20X/../a.zip')).status===200 || 'not sealed');
  await t('No uploads after sealing', async()=> (await call('PUT','&part=0',B)).status===409 && (await call('POST','&parts=2')).status===409 || 'still writable');
  await t('Meta: parts, size and a safe file name', async()=>{ const m=await (await call('GET','&meta=1')).json(); return (m.parts===2 && m.size===1500 && m.name==='Order_X_.._a.zip') || JSON.stringify(m); });
  await t('Parts download intact, in order', async()=>{ const a=new Uint8Array(await (await call('GET','&part=0')).arrayBuffer()), b=new Uint8Array(await (await call('GET','&part=1')).arrayBuffer());
    return (a.length===1000 && a.every(x=>x===7) && b.length===500 && b.every(x=>x===9) && (await call('GET','&part=2')).status===400) || 'mismatch'; });
  await t('Download page is HTML, not indexed, and escapes the name', async()=>{ const r=await call('GET',''); const h=await r.text();
    return (r.headers.get('content-type').startsWith('text/html') && r.headers.get('x-robots-tag')==='noindex' && /Download ZIP/.test(h) && !/<\/script><script/.test(h)) || 'bad page'; });
  await t('Other methods refused', async()=> (await call('DELETE','')).status===405 || 'allowed');
  const pass=res.filter(Boolean).length; console.log(pass+'/'+res.length+' passed'); process.exit(pass===res.length?0:1); })();
