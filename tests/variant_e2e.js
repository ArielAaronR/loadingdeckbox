// Case version: strap loops (v33) vs rectangle (v35, no end caps)
const {chromium}=require('playwright'),fs=require('fs'); const W=process.env.APP||'../';
const res=[]; const t=async(n,f)=>{ try{ const r=await f(); const ok=r===true||r===undefined; res.push(ok); console.log((ok?'PASS ':'FAIL ')+n+(typeof r==='string'?' — '+r:'')); return; res.push(r!==false); console.log((r!==false?'PASS ':'FAIL ')+n+(typeof r==='string'?' — '+r:'')); }catch(e){ res.push(false); console.log('FAIL '+n+' — '+e.message.split('\n')[0]); } };
(async()=>{ const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']}); const c=await b.newContext({viewport:{width:1440,height:900}}); const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(()=>{ try{ localStorage.setItem('loadingdeck:tour:v1','dismissed'); }catch(e){} });   // tour invite is covered by tour_e2e.js
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
  let loops; await t('Loops: End 01 export has the strap cut-out', async()=>{ loops=await holeAlpha(); return loops.clear>0.15 ? true : JSON.stringify(loops)+' (expected >15% transparent)'; });
  const vis=id=>p.evaluate(i=>{ const b=document.querySelector(`[data-slot="${i}"]`); return !!b && b.offsetParent!==null; },id);
  await t('Loops: inside-cap skins listed, lid end skins not', async()=> (await vis('Inner_End_01')) && (await vis('Inner_End_03')) && !(await vis('Lid_End_01')) && !(await vis('Lid_End_03')));
  await t('Switch to Rectangle', async()=>{ await p.click('[data-variant="plain"]'); await p.waitForTimeout(400); return (await p.getAttribute('[data-variant="plain"]','aria-pressed'))==='true' && (await p.textContent('[data-variant="plain"]')).trim()==='Rectangle'; });
  await t('Rectangle: lid end skins listed, inside-cap skins gone', async()=> !(await vis('Inner_End_01')) && !(await vis('Inner_End_03')) && (await vis('Lid_End_01')) && (await vis('Lid_End_03')));
  await t('Rectangle: base end skin renamed and resized', async()=>{ const d=await p.textContent('[data-slot="End_Skin_01"]'); return (/Base end 01/.test(d) && /61\.2 × 48\.[12]/.test(d)) || d; });
  const pngSize=async id=>{ await p.click(`[data-slot="${id}"]`); await p.waitForTimeout(300); const n0=await p.evaluate(()=>window.__saves.length); await p.click('#xOne'); await p.waitForFunction(n=>window.__saves.length>n,n0);
    return p.evaluate(async()=>{ const s=window.__saves.at(-1); const im=await createImageBitmap(await (await fetch('data:image/png;base64,'+s.b64)).blob()); return {name:s.filename,w:im.width,h:im.height}; }); };
  const px=mm=>Math.round(mm/25.4*600);
  await t('Rectangle: base end export is true size (61.2 × 48.2 mm @ 600 ppi)', async()=>{ const r=await pngSize('End_Skin_01'); return (Math.abs(r.w-px(61.2))<=2 && Math.abs(r.h-px(48.15))<=2) || JSON.stringify(r); });
  await t('Rectangle: lid end export is true size (61.2 × 25.3 mm @ 600 ppi)', async()=>{ const r=await pngSize('Lid_End_03'); return (Math.abs(r.w-px(61.2))<=2 && Math.abs(r.h-px(25.3))<=2) || JSON.stringify(r); });
  await t('Rectangle ZIP: named for the version, lid ends in, inside-cap skins out', async()=>{ const n0=await p.evaluate(()=>window.__saves.length); await p.click('#xAll'); await p.waitForFunction(n=>window.__saves.length>n,n0,{timeout:90000});
    const z=await p.evaluate(()=>{ const s=window.__saves.at(-1); return {name:s.filename, txt:atob(s.b64).match(/[A-Za-z0-9_ .-]+\.png/g)||[]}; });
    const names=[...new Set(z.txt)]; const ok=z.name==='3Bay_Case_Rectangle_Skins_600ppi.zip' && names.some(n=>/Lid_end_01|Lid end 01|Lid_End_01/i.test(n)) && !names.some(n=>/Inside_end|Inner_End/i.test(n));
    return ok || JSON.stringify({name:z.name,names}); });
  await t('Choice remembered after reload', async()=>{ await p.reload(); await p.waitForFunction(()=>document.getElementById('loading').hidden); await p.waitForTimeout(500); return (await p.getAttribute('[data-variant="plain"]','aria-pressed'))==='true'; });
  await p.screenshot({path:'variant_plain.png'}); await p.click('#lidBtn'); await p.waitForTimeout(1200); await p.screenshot({path:'variant_plain_open.png'}); await p.click('#lidBtn'); await p.waitForTimeout(900);
  await t('Back to loops: inside-cap skins back, End 01 back to 45.1 × 37.6', async()=>{ await p.click('[data-variant="loops"]'); await p.waitForTimeout(300); const d=await p.textContent('[data-slot="End_Skin_01"]'); return ((await p.getAttribute('[data-variant="loops"]','aria-pressed'))==='true' && (await vis('Inner_End_01')) && !(await vis('Lid_End_01')) && /End 01/.test(d) && /45\.1 × 37\.6/.test(d)) || d; });
  await t('No script errors', ()=>errs.length===0 || errs.join(' | '));
  console.log(res.filter(Boolean).length+'/'+res.length+' passed'); await b.close(); })();
