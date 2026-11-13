// Case ends variant: strap loops vs plain ends
const {chromium}=require('playwright'),fs=require('fs'); const W=process.env.APP||'../';
const res=[]; const t=async(n,f)=>{ try{ const r=await f(); res.push(r!==false); console.log((r!==false?'PASS ':'FAIL ')+n+(typeof r==='string'?' — '+r:'')); }catch(e){ res.push(false); console.log('FAIL '+n+' — '+e.message.split('\n')[0]); } };
(async()=>{ const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']}); const c=await b.newContext({viewport:{width:1440,height:900}}); const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(()=>{window.__saves=[];window.claude={use:async n=>n==='downloads'?{save:async({filename,data})=>{const u=new Uint8Array(await data.arrayBuffer());window.__saves.push({filename,b64:btoa(Array.from(u,c=>String.fromCharCode(c)).join(''))});return{status:'saved'}}}:null};});
  await p.route('**/*',r=>{const u=r.request().url();
    if(u.includes('three@0.160.0/'))return r.fulfill({path:'node_modules/three/'+u.split('three@0.160.0/')[1],contentType:'application/javascript',headers:{'Access-Control-Allow-Origin':'*'}});
    if(u.startsWith('http://app/'))return r.fulfill({body:(h=>/^<!doctype/i.test(h)?h:'<!doctype html><html><head><meta charset=utf8><style>body{margin:0}[hidden]{display:none!important}</style></head><body>'+h+'</body></html>')(fs.readFileSync(W+'index.html','utf8')),contentType:'text/html'}); return r.abort(); });
  await p.goto('http://app/'); await p.waitForFunction(()=>document.getElementById('loading').hidden);
  const holeAlpha=async()=>{ // export End 01 and sample the middle of the strap-bar cut-out
    const n0=await p.evaluate(()=>window.__saves.length); await p.click('#xOne'); await p.waitForFunction(n=>window.__saves.length>n,n0);
    return p.evaluate(async()=>{ const s=window.__saves.at(-1); const im=await createImageBitmap(await (await fetch('data:image/png;base64,'+s.b64)).blob()); const c=new OffscreenCanvas(im.width,im.height), x=c.getContext('2d'); x.drawImage(im,0,0);
      // scan the centre row for transparent pixels inside the skin
      const d=x.getImageData(0,0,im.width,im.height).data; let clear=0; for (let i=3;i<d.length;i+=4) if (d[i]===0) clear++; return {name:s.filename, clear: clear/(im.width*im.height)}; }); };
  await t('Default is Strap loops', async()=> (await p.getAttribute('[data-variant="loops"]','aria-pressed'))==='true');
  await p.click('[data-slot="End_Skin_01"]'); await p.waitForTimeout(500);
  let loops; await t('Loops: End 01 export has the strap cut-out', async()=>{ loops=await holeAlpha(); return loops.clear>0.15 ? true : JSON.stringify(loops)+' (expected >15% transparent)' && false; });
  await t('Switch to Plain ends', async()=>{ await p.click('[data-variant="plain"]'); await p.waitForTimeout(400); return (await p.getAttribute('[data-variant="plain"]','aria-pressed'))==='true'; });
  await t('Plain: End 01 export has no cut-out', async()=>{ const r=await holeAlpha(); console.log('   transparent share: loops %s, plain %s',loops.clear.toFixed(3),r.clear.toFixed(3)); return r.clear < loops.clear-0.1; });
  await t('Plain ends ZIP is named for the variant', async()=>{ const n0=await p.evaluate(()=>window.__saves.length); await p.click('#xAll'); await p.waitForFunction(n=>window.__saves.length>n,n0,{timeout:60000}); const nm=await p.evaluate(()=>window.__saves.at(-1).filename); return nm==='3Bay_Case_PlainEnds_Skins_600ppi.zip' || nm; });
  await t('Choice remembered after reload', async()=>{ await p.reload(); await p.waitForFunction(()=>document.getElementById('loading').hidden); await p.waitForTimeout(500); return (await p.getAttribute('[data-variant="plain"]','aria-pressed'))==='true'; });
  await p.screenshot({path:'variant_plain.png'});
  await t('Back to loops', async()=>{ await p.click('[data-variant="loops"]'); await p.waitForTimeout(300); return (await p.getAttribute('[data-variant="loops"]','aria-pressed'))==='true'; });
  await t('No script errors', ()=>errs.length===0 || errs.join(' | '));
  console.log(res.filter(Boolean).length+'/'+res.length+' passed'); await b.close(); })();
