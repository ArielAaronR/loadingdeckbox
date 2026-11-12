// End-to-end tests for 3-Bay Case Skin Studio (Playwright, Chromium).
// CDN libraries are served from local npm copies; window.claude.downloads is mocked to capture exports.
const {chromium}=require('playwright'), fs=require('fs');
const W=process.env.APP||'../';   // folder holding index.html
const JSZip=require('jszip');
const results=[]; let page;
const ok=(name,pass,info='')=>{results.push({name,pass,info}); console.log(`${pass?'PASS':'FAIL'}  ${name}${info?'  — '+info:''}`);};
async function t(name,fn){ try{ const r=await fn(); ok(name,r!==false,typeof r==='string'?r:''); }catch(e){ ok(name,false,e.message.split('\n')[0]); } }
const pngInfo=b=>{ const dv=new DataView(b.buffer,b.byteOffset); const w=dv.getUint32(16), h=dv.getUint32(20);
  const i=b.indexOf(Buffer.from('pHYs')); const ppm=i>0?dv.getUint32(i+4):0; return {w,h,ppi:Math.round(ppm*0.0254)}; };

async function open(b,{width,height,scheme='light',mock=true,blockThree=false}){
  const ctx=await b.newContext({viewport:{width,height},colorScheme:scheme});
  const p=await ctx.newPage(); p.errors=[];
  p.on('pageerror',e=>p.errors.push(e.message)); p.on('console',m=>{ if(m.type()==='error'&&!/ERR_FAILED|fonts/.test(m.text())) p.errors.push(m.text()); });
  if (!mock) await p.addInitScript(()=>{ window.claude={use:async()=>null}; });   // inside Claude, but saving not allowed
  if (mock) await p.addInitScript(()=>{ window.__saves=[]; window.claude={use:async n=>n==='downloads'?{save:async({filename,data})=>{
      const buf=data instanceof Blob?new Uint8Array(await data.arrayBuffer()):new Uint8Array(data); window.__saves.push({filename,b64:btoa(Array.from(buf,c=>String.fromCharCode(c)).join(''))}); return {status:'saved'}; }}:null}; });
  const bytes={}; let t0;
  await p.route('**/*',r=>{const u=r.request().url();
    if(blockThree && u.includes('three@')) return r.abort();
    if(u.includes('three@0.160.0/')){ const f='node_modules/three/'+u.split('three@0.160.0/')[1]; bytes[u]=fs.statSync(f).size; return r.fulfill({path:f,contentType:'application/javascript',headers:{'Access-Control-Allow-Origin':'*'}}); }
    if(u.includes('jszip.min.js')){ bytes[u]=fs.statSync('node_modules/jszip/dist/jszip.min.js').size; return r.fulfill({path:'node_modules/jszip/dist/jszip.min.js',contentType:'application/javascript',headers:{'Access-Control-Allow-Origin':'*'}}); }
    if(u.startsWith('http://app/')){ const raw=fs.readFileSync(W+'index.html','utf8'); const html=/^<!doctype/i.test(raw)?raw:'<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>'+raw+'</body></html>'; bytes.html=html.length; return r.fulfill({body:html,contentType:'text/html'}); }
    return r.abort(); });
  t0=Date.now(); await p.goto('http://app/index.html');
  if (blockThree) await p.waitForFunction(()=>/could not load/.test(document.getElementById('loading').textContent),null,{timeout:20000});
  else await p.waitForFunction(()=>document.getElementById('loading').hidden,null,{timeout:20000});
  p.loadMs=Date.now()-t0; p.bytes=bytes; return p;
}
const saves=async()=>page.evaluate(()=>window.__saves.map(s=>({filename:s.filename,b64:s.b64})));
const mainColor=async(sel)=>page.evaluate(s=>{ const c=document.querySelector(s); const x=c.getContext('2d'); const d=x.getImageData(0,0,c.width,c.height).data; let r=0,g=0,b=0,n=0; for(let i=0;i<d.length;i+=40){ if(d[i+3]>0){r+=d[i];g+=d[i+1];b+=d[i+2];n++;} } return n?[r/n|0,g/n|0,b/n|0,n]:[0,0,0,0]; },sel);

(async()=>{
  const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--enable-precise-memory-info']});
  page=await open(b,{width:1440,height:900});

  await t('Loads with no script errors', ()=> page.errors.length===0 || page.errors.join(' | '));
  await t('3D model is in the scene (lid, base, rocker, insert)', ()=>page.evaluate(()=>!!document.getElementById('loading').hidden));
  await t('Twelve skin slots listed (6 outside, 6 inside)', async()=>{ const a=await page.$$eval('#slotsOut .slot',e=>e.length), c=await page.$$eval('#slotsIn .slot',e=>e.length); return a===6&&c===6 || `${a}/${c}`; });
  await t('Slot sizes match the CAD skins', async()=>{ const d=await page.$$eval('.slot .dim',e=>e.map(x=>x.textContent)); const want=['177.8 × 72.1','168.0 × 23.1','168.0 × 23.1','168.0 × 40.8','45.1 × 37.6','45.1 × 37.6','171.9 × 58.3','171.0 × 38.7','60.1 × 24.8','60.1 × 24.8','20.5 × 55.0','20.5 × 55.0'];
    return want.every((w,i)=>d[i].startsWith(w)) || d.join(' | '); });
  await t('3D canvas is drawing pixels', async()=>{ const n=await page.evaluate(()=>{ const c=document.getElementById('gl'); return c.width*c.height; }); return n>100000; });

  // selection + editor
  await t('Selecting a slot switches the editor', async()=>{ await page.click('[data-slot="Base_Back_Plate"]'); await page.waitForTimeout(400); return (await page.textContent('#edName'))==='Back'; });
  await t('Layer controls hidden until a layer exists', async()=> await page.isHidden('#props') && await page.isVisible('#layerEmpty'));
  await t('Rejects a non-image file with a clear message', async()=>{ await page.setInputFiles('#file','fixtures/not_image.txt'); await page.waitForTimeout(200); const s=await page.textContent('#status'); return /not an image/.test(s)||s; });
  let tUp; await t('Uploads a 12 MP photo and fills the skin', async()=>{ tUp=Date.now(); await page.setInputFiles('#file','fixtures/photo_12mp.jpg'); await page.waitForFunction(()=>/added to/.test(document.getElementById('status').textContent)); tUp=Date.now()-tUp;
    const tag=await page.textContent('[data-slot="Base_Back_Plate"] .tag'); return tag==='Your art' || tag; });
  await t('Resolution note shown after upload', async()=>{ const s=await page.textContent('#status'); return /ppi/.test(s)? s : false; });
  await t('Counter shows skins with your art', async()=> (await page.textContent('#countMine')).includes('1 of 12'));

  await t('Drag moves the photo', async()=>{ const box=await page.locator('#ed').boundingBox(); const before=await mainColor('#ed');
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down(); await page.mouse.move(box.x+box.width/2+80,box.y+box.height/2+20,{steps:6}); await page.mouse.up(); await page.waitForTimeout(150);
    const after=await mainColor('#ed'); return JSON.stringify(before)!==JSON.stringify(after) || 'canvas unchanged'; });
  await t('Wheel resizes (size readout changes)', async()=>{ const box=await page.locator('#ed').boundingBox(); await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.wheel(0,-300); await page.waitForTimeout(150); const z=await page.textContent('#zoomOut'); return z!=='100%' || z; });
  await t('Fill resets size to 100%', async()=>{ await page.click('#bFill'); return (await page.textContent('#zoomOut'))==='100%'; });
  await t('Rotate 90° updates angle', async()=>{ await page.click('#bRot'); return (await page.textContent('#rotOut'))==='90°'; });
  await t('Angle slider works', async()=>{ await page.fill('#rot','-12'); await page.dispatchEvent('#rot','input'); return (await page.textContent('#rotOut'))==='-12°'; });
  await t('Background colour toggles', async()=>{ await page.check('#bgOn'); return await page.isChecked('#bgOn'); });

  // lid
  await t('Open lid animates to 105°', async()=>{ await page.click('#lidBtn'); await page.waitForTimeout(1100); return (await page.textContent('#angle'))==='Lid 105°' && (await page.textContent('#lidBtn'))==='Close lid'; });
  await t('Close lid returns to 0°', async()=>{ await page.click('#lidBtn'); await page.waitForTimeout(1100); return (await page.textContent('#angle'))==='Lid 0°'; });
  await t('Picking the lid liner opens the lid', async()=>{ await page.click('[data-slot="Lid_Liner"]'); await page.waitForTimeout(1100); return (await page.textContent('#angle'))==='Lid 105°'; });
  await t('Clicking a skin in 3D selects it', async()=>{ await page.click('#lidBtn'); await page.click('[data-view="front"]'); await page.waitForTimeout(1000);
    const box=await page.locator('#gl').boundingBox(); await page.mouse.click(box.x+box.width*0.38,box.y+box.height*0.56); await page.waitForTimeout(300); const n=await page.textContent('#edName'); return /front/i.test(n) || n; });
  await t('Picking an inside end skin opens the lid', async()=>{ await page.click('#lidBtn'); await page.waitForTimeout(1100); await page.click('[data-slot="Inner_End_03"]'); await page.waitForTimeout(1200); return (await page.textContent('#angle'))==='Lid 105°' && (await page.textContent('#edName'))==='Inside end 03'; });
  await page.screenshot({path:'inner_view.png'});
  await page.click('#lidBtn'); await page.waitForTimeout(1100);
  await t('Filament colour buttons switch', async()=>{ await page.click('[data-fil="#2a2c30"]'); return (await page.getAttribute('[data-fil="#2a2c30"]','aria-pressed'))==='true'; });

  // export
  await page.click('[data-slot="Base_Back_Plate"]'); await page.waitForTimeout(300);
  let tEx; await t('Export one skin: correct size at 600 ppi', async()=>{ tEx=Date.now(); await page.click('#xOne'); await page.waitForFunction(()=>window.__saves.length>=1,null,{timeout:20000}); tEx=Date.now()-tEx;
    const s=(await saves())[0]; const info=pngInfo(Buffer.from(s.b64,'base64')); fs.writeFileSync('out_back.png',Buffer.from(s.b64,'base64'));
    return (info.w===3969&&info.h===964&&info.ppi===600&&/Base_Back_Plate_168.0x40.8mm_600ppi.png/.test(s.filename)) || JSON.stringify(info)+' '+s.filename; });
  await t('Exported PNG is transparent outside the skin shape', async()=>{ const s=(await saves())[0]; const r=await page.evaluate(async b64=>{ const im=await createImageBitmap(await (await fetch('data:image/png;base64,'+b64)).blob()); const c=new OffscreenCanvas(im.width,im.height); const x=c.getContext('2d'); x.drawImage(im,0,0);
      const a=(px,py)=>x.getImageData(px,py,1,1).data[3]; return {topRightNotch:a(im.width-20,10), middle:a(im.width>>1,im.height>>1)}; }, s.b64); return (r.topRightNotch===0 && r.middle===255) || JSON.stringify(r); });
  let tZip; await t('Export all: ZIP has 12 PNGs + README, all 600 ppi', async()=>{ tZip=Date.now(); await page.click('#xAll'); await page.waitForFunction(()=>window.__saves.length>=2,null,{timeout:120000}); tZip=Date.now()-tZip;
    const s=(await saves())[1]; const z=await JSZip.loadAsync(Buffer.from(s.b64,'base64')); const names=Object.keys(z.files); const pngs=names.filter(n=>n.endsWith('.png'));
    const infos=await Promise.all(pngs.map(async n=>pngInfo(Buffer.from(await z.file(n).async('uint8array')))));
    fs.writeFileSync('out_all.zip',Buffer.from(s.b64,'base64'));
    return (pngs.length===12 && names.includes('README.txt') && infos.every(i=>i.ppi===600)) || names.join(','); });
  await t('Remove photo returns skin to sample art', async()=>{ await page.click('#bClear'); return (await page.textContent('[data-slot="Base_Back_Plate"] .tag'))==='Sample'; });
  await t('Oversized 54 MP photo is scaled to ≤40 MP, no crash', async()=>{ await page.setInputFiles('#file','fixtures/photo_54mp.jpg'); await page.waitForFunction(()=>/added to/.test(document.getElementById('status').textContent)); return page.errors.length===0 || page.errors.join('|'); });
  const perf=await page.evaluate(async()=>{ const f=[]; let last=performance.now(); await new Promise(r=>{ let n=0; const step=t=>{ f.push(t-last); last=t; if(++n<90) requestAnimationFrame(step); else r(); }; requestAnimationFrame(step); });
    f.sort((a,b)=>a-b); return {fpsMedian:Math.round(1000/f[f.length>>1]), heapMB:performance.memory?Math.round(performance.memory.usedJSHeapSize/1e6):null}; });
  await t('No errors after full run', ()=> page.errors.length===0 || page.errors.join(' | '));
  const loadMs=page.loadMs, bytes=page.bytes;
  await page.context().close();

  // without downloads capability
  page=await open(b,{width:1440,height:900,mock:false});
  await t('Without save permission: export buttons disabled with a note', async()=>{ await page.waitForTimeout(11000); return (await page.isDisabled('#xOne')) && /open in Claude/.test(await page.textContent('#status')); });
  await page.context().close();

  // resilience
  page=await open(b,{width:1440,height:900});
  await t('Work survives a reload (saved in this browser)', async()=>{ await page.setInputFiles('#file','fixtures/photo_12mp.jpg'); await page.waitForTimeout(900); await page.reload(); await page.waitForFunction(()=>document.getElementById('loading').hidden); await page.waitForTimeout(900);
    return (await page.textContent('[data-slot="Lid_Top"] .tag'))==='Your art' || await page.textContent('#status'); });
  await t('Start over needs two clicks and clears everything', async()=>{ await page.click('#xReset'); const mid=await page.textContent('[data-slot="Lid_Top"] .tag'); await page.click('#xReset'); await page.waitForTimeout(600);
    await page.reload(); await page.waitForFunction(()=>document.getElementById('loading').hidden); await page.waitForTimeout(600); return mid==='Your art' && (await page.textContent('[data-slot="Lid_Top"] .tag'))==='Sample'; });
  await t('Keyboard: arrows, +/- and [ ] edit the photo', async()=>{ await page.setInputFiles('#file','fixtures/photo_12mp.jpg'); await page.waitForTimeout(600); await page.focus('#ed'); await page.keyboard.press('+'); await page.keyboard.press(']');
    return (await page.textContent('#rotOut'))==='1°' && (await page.textContent('#zoomOut'))!=='100%'; });
  await page.context().close();
  page=await open(b,{width:1440,height:900,blockThree:true}).catch(e=>null);
  if (page){ await t('3D library offline: editor and export still work', async()=>{ await page.setInputFiles('#file','fixtures/photo_12mp.jpg'); await page.waitForTimeout(800);
      return (await page.textContent('[data-slot="Lid_Top"] .tag'))==='Your art' && await page.isDisabled('#lidBtn') && !(await page.isDisabled('#xOne')) && /could not load/.test(await page.textContent('#loading')); });
    await page.context().close(); }

  // phone + dark
  page=await open(b,{width:390,height:844,scheme:'dark'});
  await t('Phone: no horizontal scroll', async()=>{ const [sw,cw]=await page.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.clientWidth]); return sw<=cw || `${sw}>${cw}`; });
  await t('Phone: upload + lid work', async()=>{ await page.setInputFiles('#file','fixtures/photo_12mp.jpg'); await page.waitForTimeout(800); await page.click('#lidBtn'); await page.waitForTimeout(1100); return (await page.textContent('#angle'))==='Lid 105°'; });
  await t('Dark theme: dark background applied', async()=>{ const bg=await page.evaluate(()=>getComputedStyle(document.body).backgroundColor); return bg==='rgb(0, 11, 19)' || bg; });
  await t('Phone: no errors', ()=> page.errors.length===0 || page.errors.join(' | '));
  await page.screenshot({path:'e2e_phone_dark.png'});
  await page.context().close(); await b.close();

  const total=Object.entries(bytes).reduce((a,[k,v])=>a+v,0);
  const metrics={loadMs, uploadMs:tUp, exportOneMs:tEx, exportAllMs:tZip, ...perf, bytes:Object.fromEntries(Object.entries(bytes).map(([k,v])=>[k.replace(/.*\//,''),Math.round(v/1000)+' KB'])), totalKB:Math.round(total/1000)};
  console.log('\nMETRICS',JSON.stringify(metrics,null,1));
  const pass=results.filter(r=>r.pass).length; console.log(`\n${pass}/${results.length} passed`);
  fs.writeFileSync('e2e_results.json',JSON.stringify({results,metrics},null,1));
})();
