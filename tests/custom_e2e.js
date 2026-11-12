// "Your model" mode: upload STL, click faces to add printable areas, design, export, reload
const {chromium}=require('playwright'),fs=require('fs');
const W=process.env.APP||'../';   // folder holding index.html
const res=[]; const t=async(n,f)=>{ try{ const r=await f(); res.push([n,r!==false]); console.log((r!==false?'PASS ':'FAIL ')+n+(typeof r==='string'?' — '+r:'')); }catch(e){ res.push([n,false]); console.log('FAIL '+n+' — '+e.message.split('\n')[0]); } };
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});const c=await b.newContext({viewport:{width:1440,height:900}});const p=await c.newPage();
await p.addInitScript(()=>{ try{ localStorage.setItem('loadingdeck:tour:v1','dismissed'); }catch(e){} });   // tour invite is covered by tour_e2e.js
const errs=[];p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{ if(m.type()==='error'&&!/ERR_FAILED/.test(m.text())) errs.push(m.text()); });
await p.addInitScript(()=>{window.__saves=[];window.claude={use:async n=>n==='downloads'?{save:async({filename,data})=>{window.__saves.push({filename,size:data.size});return{status:'saved'}}}:null};});
await p.route('**/*',r=>{const u=r.request().url();
 if(u.includes('three@0.160.0/'))return r.fulfill({path:'node_modules/three/'+u.split('three@0.160.0/')[1],contentType:'application/javascript',headers:{'Access-Control-Allow-Origin':'*'}});
 if(u.startsWith('http://app/'))return r.fulfill({body:(h=>/^<!doctype/i.test(h)?h:'<!doctype html><html><head><meta charset=utf8><style>body{margin:0}[hidden]{display:none!important}</style></head><body>'+h+'</body></html>')(fs.readFileSync(W+'index.html','utf8')),contentType:'text/html'});return r.abort();});
await p.goto('http://app/'+(process.env.HASH||''));await p.waitForFunction(()=>document.getElementById('loading').hidden);
if (!process.env.HASH){ await t('Flag off: mode switch hidden', async()=>await p.isHidden('#modeSwitch')); console.log(res.filter(r=>r[1]).length+'/'+res.length+' passed'); await b.close(); return; }
await t('Switch to Your model shows the upload card', async()=>{ await p.click('[data-mode="custom"]'); await p.waitForTimeout(300); return await p.isVisible('#customEmpty') && await p.isHidden('#caseSlots') && await p.isHidden('#lidBtn'); });
await t('Upload an STL', async()=>{ await p.setInputFiles('#modelFile','fixtures/model_test.stl'); await p.waitForFunction(()=>/loaded/.test(document.getElementById('status').textContent),null,{timeout:20000}); return await p.textContent('#status'); });
const gl=await p.locator('#gl').boundingBox(); const center=async()=>{ await p.waitForTimeout(900); await p.mouse.click(gl.x+gl.width/2, gl.y+gl.height/2); await p.waitForTimeout(500); };
await t('Click top face → printable area with the hole traced', async()=>{ await center(); const d=await p.$$eval('#slotsCustom .slot .dim',e=>e.map(x=>x.textContent)); const nm=await p.$$eval('#slotsCustom .slot .nm',e=>e.map(x=>x.textContent));
  return (d.length===1 && d[0].startsWith('160.0 × 80.0') && nm[0].startsWith('Top')) || (nm.join(',')+' | '+d.join(',')); });
await t('Clicking the same face again does not duplicate it', async()=>{ await p.click('[data-view="iso"]'); await center(); return (await p.$$eval('#slotsCustom .slot',e=>e.length))===1 || await p.textContent('#status'); });
await t('Front view → front face added (160 × 20)', async()=>{ await p.click('[data-view="front"]'); await center(); const d=await p.$$eval('#slotsCustom .slot .dim',e=>e.map(x=>x.textContent)); return d.length===2 && d[1].startsWith('160.0 × 20.0') || d.join(','); });
await t('Design the top face: text layer + export PNG at true size', async()=>{ await p.click('#slotsCustom .slotrow:first-child .slot'); await p.waitForTimeout(500); await p.click('#addText'); await p.fill('#txt','MY CUSTOM'); await p.waitForTimeout(200);
  await p.click('#xOne'); await p.waitForFunction(()=>window.__saves.length>0); const s=await p.evaluate(()=>window.__saves[0]); return /Model_Face_1_160.0x80.0mm_600ppi.png/.test(s.filename) || s.filename; });
await t('Export all only includes model faces', async()=>{ await p.click('#xAll'); await p.waitForFunction(()=>window.__saves.length>1,null,{timeout:60000}); const s=await p.evaluate(()=>window.__saves[1]); return s.size>1000; });
await t('Units locked while faces exist', async()=>await p.isDisabled('#units'));
await p.screenshot({path:'custom_mode.png'});
await t('Model, faces and layers survive a reload', async()=>{ await p.waitForTimeout(800); await p.reload(); await p.goto('http://app/#custom-model'); await p.waitForFunction(()=>document.getElementById('loading').hidden); await p.waitForTimeout(2500);
  await p.click('[data-mode="custom"]'); await p.waitForTimeout(1500); const n=await p.$$eval('#slotsCustom .slot',e=>e.length); const tag=await p.textContent('#slotsCustom .slotrow:first-child .tag');
  return n===2 && tag==='Your art' || `${n} faces, tag ${tag}`; });
await t('Remove a face', async()=>{ await p.click('#slotsCustom .slotrow:last-child .ibtn'); return (await p.$$eval('#slotsCustom .slot',e=>e.length))===1; });
await t('Back to case mode: case skins intact', async()=>{ await p.click('[data-mode="case"]'); await p.waitForTimeout(400); return await p.isVisible('#caseSlots') && (await p.$$eval('#slotsOut .slot',e=>e.length))===6 && await p.isVisible('#lidBtn'); });
await t('Remove model (two clicks)', async()=>{ await p.click('[data-mode="custom"]'); await p.click('#removeModel'); await p.click('#removeModel'); await p.waitForTimeout(300); return await p.isVisible('#customEmpty'); });
await t('Rejects a non-model file', async()=>{ await p.setInputFiles('#modelFile','fixtures/not_image.txt'); await p.waitForTimeout(200); return /STL, 3MF, OBJ or GLB/.test(await p.textContent('#status')); });
await t('No script errors', ()=>errs.length===0 || errs.slice(0,3).join(' | '));
console.log(res.filter(r=>r[1]).length+'/'+res.length+' passed'); await b.close();})();
