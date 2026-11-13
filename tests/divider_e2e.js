// Lid divider: toggle, 3D frame, liner footprint (editor only), export unchanged, print files, remembered choice
const {chromium}=require('playwright'),fs=require('fs'),JSZip=require('jszip'); const W=process.env.APP||'../';
const res=[]; const t=async(n,f)=>{ try{ const r=await f(); const ok=r===true||r===undefined; res.push(ok); console.log((ok?'PASS ':'FAIL ')+n+(typeof r==='string'?' — '+r:'')); }catch(e){ res.push(false); console.log('FAIL '+n+' — '+e.message.split('\n')[0]); } };

// A 3MF print file: one watertight mesh (every edge shared by exactly two triangles) of the expected size
async function check3mf(file, size){
  const zip=await JSZip.loadAsync(fs.readFileSync(W+file)); const xml=await zip.file('3D/3dmodel.model').async('string');
  const V=[...xml.matchAll(/<vertex x="([-\d.]+)" y="([-\d.]+)" z="([-\d.]+)"/g)].map(m=>[+m[1],+m[2],+m[3]]);
  const T=[...xml.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)].map(m=>[+m[1],+m[2],+m[3]]);
  const edges=new Map(); for (const [a,b,c] of T) for (const [p,q] of [[a,b],[b,c],[c,a]]){ const k=p<q?p+'_'+q:q+'_'+p; edges.set(k,(edges.get(k)||0)+1); }
  const open=[...edges.values()].filter(n=>n!==2).length;
  const ext=[0,1,2].map(i=>Math.max(...V.map(v=>v[i]))-Math.min(...V.map(v=>v[i])));
  const okSize=ext.every((e,i)=>Math.abs(e-size[i])<0.2), flat=Math.min(...V.map(v=>v[2]))===0;
  return (T.length>100 && open===0 && okSize && flat) || JSON.stringify({tris:T.length,open,ext:ext.map(e=>+e.toFixed(1)),size,flat});
}

(async()=>{ const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']}); const c=await b.newContext({viewport:{width:1440,height:900}}); const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(()=>{ try{ localStorage.setItem('loadingdeck:tour:v1','dismissed'); }catch(e){} });   // tour invite is covered by tour_e2e.js
  await p.addInitScript(()=>{window.__saves=[];window.claude={use:async n=>n==='downloads'?{save:async({filename,data})=>{const u=new Uint8Array(await data.arrayBuffer());window.__saves.push({filename,b64:btoa(Array.from(u,c=>String.fromCharCode(c)).join(''))});return{status:'saved'}}}:null};});
  await p.route('**/*',r=>{const u=r.request().url();
    if(u.includes('three@0.160.0/'))return r.fulfill({path:'node_modules/three/'+u.split('three@0.160.0/')[1],contentType:'application/javascript',headers:{'Access-Control-Allow-Origin':'*'}});
    if(u.startsWith('http://app/'))return r.fulfill({body:fs.readFileSync(W+'index.html','utf8'),contentType:'text/html'}); return r.abort(); });
  const load=async()=>{ await p.waitForFunction(()=>document.getElementById('loading').hidden); await p.waitForTimeout(400); };
  await p.goto('http://app/'); await load();
  const DIV=await p.evaluate(()=>JSON.parse(document.getElementById('lidDivider').textContent));
  const pressed=()=>p.getAttribute('#divBtn','aria-pressed');
  const stage=async()=>(await p.locator('#gl').screenshot()).toString('base64');
  const editor=()=>p.evaluate(()=>document.getElementById('ed').toDataURL());
  const diff=(a,b)=>{ const A=Buffer.from(a,'base64'), B=Buffer.from(b,'base64'); return A.length!==B.length || !A.equals(B); };
  const exportLiner=async()=>{ const n0=await p.evaluate(()=>window.__saves.length); await p.click('#xOne'); await p.waitForFunction(n=>window.__saves.length>n,n0); return p.evaluate(()=>window.__saves.at(-1)); };

  await t('Off by default; liner controls only on the Lid liner skin', async()=> (await pressed())==='false' && await p.isHidden('#divRow'));
  await p.click('#lidBtn'); await p.waitForTimeout(1300); await p.click('[data-view="front"]'); await p.waitForTimeout(1000);
  await p.click('[data-slot="Lid_Liner"]'); await p.waitForTimeout(1200);
  const off3d=await stage(), offEd=await editor(), offPng=await exportLiner();
  await t('Lid liner shows the divider row with the print file link', async()=> await p.isVisible('#divRow') && (await p.getAttribute('#divFile','href'))===DIV.loops.file);
  await t('Toggle on: button pressed, checkbox ticked, status explains it', async()=>{ await p.click('#divBtn'); await p.waitForTimeout(1300);
    const st=await p.textContent('#status'); return ((await pressed())==='true' && await p.isChecked('#divOn') && /Lid divider on/.test(st) && await p.isVisible('#divHint')) || st; });
  await t('3D view shows the frame in the open lid', async()=> diff(off3d, await stage()) || 'stage unchanged');
  await t('Editor shades where the frame covers the liner', async()=> diff(offEd.split(',')[1], (await editor()).split(',')[1]) || 'editor unchanged');
  await t('Liner export is unchanged (footprint is a guide only)', async()=>{ const on=await exportLiner(); return (on.b64===offPng.b64 && on.filename===offPng.filename) || 'export differs'; });
  await t('Strap loops print file: watertight, 172.2 × 57.2 × 22.5 mm, flat on the bed', ()=>check3mf(DIV.loops.file, DIV.loops.size));
  await t('Rectangle print file: watertight, 167.1 × 57.2 × 22.5 mm, flat on the bed', ()=>check3mf(DIV.plain.file, DIV.plain.size));
  await t('Footprint keeps clear of the bay number rings', ()=>{ const rings=[32,86,140].map(u=>[u-17,u+17]);
    for (const v of ['loops','plain']) for (const [u0,v0,u1,v1] of DIV[v].footprint){ if (v1-v0>20 && u1-u0<3) for (const [a,z] of rings) if (u1>a && u0<z) return `${v}: wall at u ${u0}-${u1} crosses a ring`;
      if (u1-u0>20 && v0<29.2+17 && v1>29.2-17) return `${v}: rail at v ${v0}-${v1} crosses the rings`; } return true; });
  await t('Rectangle swaps in its own frame and print file', async()=>{ await p.click('[data-variant="plain"]'); await p.waitForTimeout(800);
    return ((await p.getAttribute('#divFile','href'))===DIV.plain.file && (await pressed())==='true' && /167\.1/.test(await p.getAttribute('#divFile','title'))) || await p.getAttribute('#divFile','href'); });
  await t('Choice remembered after reload', async()=>{ await p.reload(); await load(); return (await pressed())==='true'; });
  await t('Unticking the checkbox turns it off everywhere', async()=>{ await p.click('[data-slot="Lid_Liner"]'); await p.waitForTimeout(300); await p.uncheck('#divOn'); await p.waitForTimeout(300);
    return (await pressed())==='false' && await p.isHidden('#divHint'); });
  await p.click('[data-variant="loops"]');
  await t('No script errors', ()=>errs.length===0 || errs.join(' | '));
  const pass=res.filter(Boolean).length; console.log(pass+'/'+res.length+' passed'); await b.close(); process.exit(pass===res.length?0:1); })();
