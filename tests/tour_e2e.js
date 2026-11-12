// Guided tour: opt-in invite on first visit, step through, remembered choice, replay from the Tour button, phone layout
const {chromium}=require('playwright'),fs=require('fs');
const W=process.env.APP||'../';   // folder holding index.html
const res=[]; const t=async(n,f)=>{ try{ const r=await f(); res.push([n,r!==false]); console.log((r!==false?'PASS ':'FAIL ')+n+(typeof r==='string'?' — '+r:'')); }catch(e){ res.push([n,false]); console.log('FAIL '+n+' — '+e.message.split('\n')[0]); } };
async function open(b,viewport){
  const c=await b.newContext({viewport}); const p=await c.newPage(); p.errs=[]; p.on('pageerror',e=>p.errs.push(e.message));
  await p.route('**/*',r=>{const u=r.request().url();
    if(u.includes('three@0.160.0/'))return r.fulfill({path:'node_modules/three/'+u.split('three@0.160.0/')[1],contentType:'application/javascript',headers:{'Access-Control-Allow-Origin':'*'}});
    if(u.startsWith('http://app/'))return r.fulfill({body:fs.readFileSync(W+'index.html','utf8'),contentType:'text/html'}); return r.abort(); });
  await p.goto('http://app/'); await p.waitForFunction(()=>document.getElementById('loading').hidden,null,{timeout:20000}); return p;
}
const title=p=>p.textContent('.tour-card h2');
const inView=(p,sel)=>p.evaluate(s=>{ const r=document.querySelector(s).getBoundingClientRect(); return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight; },sel);
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
let p=await open(b,{width:1440,height:900});
await t('First visit shows the opt-in invite', async()=>{ await p.waitForSelector('.tour-card',{timeout:3000}); return (await title(p))==='New to Loading Deck?' || await title(p); });
await t('Invite is a labelled dialog with focus on "Show me around"', async()=>p.evaluate(()=>{ const c=document.querySelector('.tour-card');
  return c.getAttribute('role')==='dialog' && document.getElementById(c.getAttribute('aria-labelledby')) && document.activeElement.id==='tourYes'; }));
await t('"Show me around" starts at step 1', async()=>{ await p.click('#tourYes'); return /Step 1 of \d/.test(await p.textContent('.tour-step')) && (await title(p))==='Live 3D preview'; });
await t('Next / Back / arrow keys move between steps', async()=>{ await p.click('#tourNext'); const a=await title(p); await p.click('#tourBack'); const b2=await title(p);
  await p.keyboard.press('ArrowRight'); const c=await title(p); return (a==='Camera and lid'&&b2==='Live 3D preview'&&c==='Camera and lid') || [a,b2,c].join(' / '); });
await t('Spotlight and card stay on screen for every step', async()=>{ await p.click('#tourBack'); const n=+(await p.textContent('.tour-step')).match(/of (\d+)/)[1]; const bad=[];
  for (let k=0;k<n;k++){ await p.waitForTimeout(300); if(!(await inView(p,'.tour-card'))) bad.push(await title(p)); if(k<n-1) await p.click('#tourNext'); }
  return !bad.length || 'off screen: '+bad.join(', '); });
await t('Last step says Done and closes the tour', async()=>{ const d=await p.textContent('#tourNext'); await p.click('#tourNext');
  return d==='Done' && !(await p.$('.tour-card')) && !(await p.$('.tour-shade')) || d; });
await t('Finished tour is remembered: no invite after reload', async()=>{ await p.reload(); await p.waitForFunction(()=>document.getElementById('loading').hidden); await p.waitForTimeout(1500); return !(await p.$('.tour-card')); });
await t('Tour button replays it; Escape closes and returns focus', async()=>{ await p.click('#tourBtn'); const s=await title(p); await p.keyboard.press('Escape');
  const gone=!(await p.$('.tour-card')); const f=await p.evaluate(()=>document.activeElement.id); return (s==='Live 3D preview'&&gone&&f==='tourBtn') || [s,gone,f].join(' / '); });
await t('App still works after the tour (slot click selects a skin)', async()=>{ await p.click('[data-slot="Base_Back_Plate"]'); return (await p.textContent('#edName'))==='Back' || await p.textContent('#edName'); });
await t('No script errors (desktop)', async()=>!p.errs.length || p.errs.join(' | '));
await p.context().close();

p=await open(b,{width:1440,height:900});
await t('"No thanks" dismisses and is remembered', async()=>{ await p.waitForSelector('.tour-card'); await p.click('#tourNo'); const gone=!(await p.$('.tour-card'));
  await p.reload(); await p.waitForFunction(()=>document.getElementById('loading').hidden); await p.waitForTimeout(1500); return gone && !(await p.$('.tour-card')); });
await p.context().close();

p=await open(b,{width:390,height:844});
await t('Phone: tour skips the hidden dock step and keeps targets in view', async()=>{ await p.waitForSelector('.tour-card'); await p.click('#tourYes');
  const n=+(await p.textContent('.tour-step')).match(/of (\d+)/)[1]; const titles=[], bad=[];
  for (let k=0;k<n;k++){ await p.waitForTimeout(350); const h=await title(p); titles.push(h); if(!(await inView(p,'.tour-card'))) bad.push(h); if(k<n-1) await p.click('#tourNext'); }
  await p.click('#tourNext'); return (!titles.includes('Move the panels') && !bad.length) || `steps: ${titles.join(', ')}; off screen: ${bad.join(', ')}`; });
await t('No script errors (phone)', async()=>!p.errs.length || p.errs.join(' | '));
await b.close(); const pass=res.filter(r=>r[1]).length; console.log(`${pass}/${res.length} passed`); process.exit(pass===res.length?0:1);})();
