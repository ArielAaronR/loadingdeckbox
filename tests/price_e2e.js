// Price panel: box + spring + plates with art, per case version; all plates of a version add up to $50
const {chromium}=require('playwright'),fs=require('fs'); const W=process.env.APP||'../';
const res=[]; const t=async(n,f)=>{ let r; try{ r=await f(); }catch(e){ r=e.message.split('\n')[0]; } const ok=r===true; res.push(ok); console.log((ok?'PASS ':'FAIL ')+n+(ok?'':' — '+r)); };
(async()=>{ const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']}); const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(()=>{ try{ localStorage.setItem('loadingdeck:tour:v1','dismissed'); }catch(e){} });
  await p.route('**/*',r=>{const u=r.request().url();
    if(u.includes('three@0.160.0/'))return r.fulfill({path:'node_modules/three/'+u.split('three@0.160.0/')[1],contentType:'application/javascript',headers:{'Access-Control-Allow-Origin':'*'}});
    if(u.startsWith('http://app/'))return r.fulfill({body:fs.readFileSync(W+'index.html','utf8'),contentType:'text/html'}); return r.abort(); });
  const load=async()=>{ await p.waitForFunction(()=>document.getElementById('loading').hidden); await p.waitForTimeout(300); };
  await p.goto('http://app/'); await load();
  const total=()=>p.textContent('#priceTotal'), lines=()=>p.$$eval('#priceLines li',ls=>ls.map(l=>[...l.children].map(c=>c.textContent.trim()).join(' ')));
  const addText=async id=>{ await p.click(`[data-slot="${id}"]`); await p.waitForTimeout(150); await p.click('#addText'); await p.waitForTimeout(250); };

  await t('Starts at the box price, no plates', async()=> ((await total())==='$30' && (await lines()).some(l=>/No plates yet/.test(l))) || (await total())+' '+(await lines()));
  await t('Every plate of each version has a price and they add up to $50', async()=>{
    for (const v of ['loops','plain']){ await p.click(`[data-variant="${v}"]`); await p.waitForTimeout(250);
      const r=await p.evaluate(()=>{ const ids=[...document.querySelectorAll('#slotsOut [data-slot],#slotsIn [data-slot]')].filter(e=>!e.hidden && e.offsetParent).map(e=>e.dataset.slot);
        return {ids, html:document.documentElement.outerHTML.match(/const PRICING=\{[\s\S]*?\} \} \};/)[0]}; });
      const P=eval('('+r.html.replace(/^const PRICING=/,'').replace(/;$/,'')+')').plates[v];
      const missing=r.ids.filter(id=>!(id in P)), sum=Object.values(P).reduce((a,x)=>a+x,0);
      if (missing.length || sum!==50 || Object.keys(P).length!==r.ids.length) return `${v}: missing ${missing} sum ${sum} keys ${Object.keys(P).length}/${r.ids.length}`; }
    await p.click('[data-variant="loops"]'); await p.waitForTimeout(250); return true; });
  await addText('Lid_Top'); await addText('Base_Back_Plate');
  await t('Plates with art are added at their price (Lid top $12 + Back $6)', async()=> ((await total())==='$48' && (await lines()).includes('Lid top $12') && (await lines()).includes('Back $6')) || (await total())+' '+(await lines()));
  await t('Spring add-on adds $5', async()=>{ await p.check('#springOn'); await p.waitForTimeout(100); return (await total())==='$53' || await total(); });
  await t('Rectangle reprices the same plates (Lid top $11)', async()=>{ await p.click('[data-variant="plain"]'); await p.waitForTimeout(300);
    return ((await total())==='$52' && (await lines())[0].includes('Rectangle')) || (await total())+' '+(await lines()); });
  await t('Colour shows on the box line', async()=>{ await p.click('[data-fil="#2a2c30"]'); await p.waitForTimeout(150); return (await lines())[0].includes('Black') || (await lines())[0]; });
  await t('Spring choice remembered after reload', async()=>{ await p.reload(); await load(); return (await p.isChecked('#springOn')) || 'not checked'; });
  await t('No script errors', ()=>errs.length===0 || errs.join(' | '));
  const pass=res.filter(Boolean).length; console.log(pass+'/'+res.length+' passed'); await b.close(); process.exit(pass===res.length?0:1); })();
