// UV jig sheets (Rectangle version): all skins placed on the printed jig, one image per jig
const {chromium}=require('playwright'),fs=require('fs'); const W=process.env.APP||'../';
const res=[]; const t=async(n,f)=>{ try{ const r=await f(); const ok=r===true||r===undefined; res.push(ok); console.log((ok?'PASS ':'FAIL ')+n+(typeof r==='string'?' — '+r:'')); return; res.push(r!==false); console.log((r!==false?'PASS ':'FAIL ')+n+(typeof r==='string'?' — '+r:'')); }catch(e){ res.push(false); console.log('FAIL '+n+' — '+e.message.split('\n')[0]); } };
(async()=>{ const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']}); const c=await b.newContext({viewport:{width:1440,height:900}}); const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(m.type()==='error'&&!/ERR_FAILED/.test(m.text())) errs.push(m.text()); });
  await p.addInitScript(()=>{window.__saves=[];window.claude={use:async n=>n==='downloads'?{save:async({filename,data})=>{const u=new Uint8Array(await data.arrayBuffer());window.__saves.push({filename,b64:btoa(Array.from(u,c=>String.fromCharCode(c)).join(''))});return{status:'saved'}}}:null};});
  await p.route('**/*',r=>{const u=r.request().url();
    if(u.includes('three@0.160.0/'))return r.fulfill({path:'node_modules/three/'+u.split('three@0.160.0/')[1],contentType:'application/javascript',headers:{'Access-Control-Allow-Origin':'*'}});
    if(u.startsWith('http://app/'))return r.fulfill({body:(h=>/^<!doctype/i.test(h)?h:'<!doctype html><html><head><meta charset=utf8><style>body{margin:0}[hidden]{display:none!important}</style></head><body>'+h+'</body></html>')(fs.readFileSync(W+'index.html','utf8')),contentType:'text/html'}); return r.abort(); });
  await p.addInitScript(()=>{ try{ localStorage.setItem('loadingdeck:tour:v1','dismissed'); }catch(e){} });
  await p.goto('http://app/'); await p.waitForFunction(()=>document.getElementById('loading').hidden);

  const shown=()=>p.evaluate(()=>{ const b=document.getElementById('xJig'); return !!b && b.offsetParent!==null; });
  await t('Jig button hidden on Strap loops', async()=>{ await p.click('[data-variant="loops"]'); await p.waitForTimeout(200); return !(await shown()); });
  await t('Jig button shown on Rectangle', async()=>{ await p.click('[data-variant="plain"]'); await p.waitForTimeout(300); return await shown(); });
  await p.click('[data-slot="Lid_Liner"]'); await p.waitForTimeout(300); await p.uncheck('#numOn');   // liner numbers count as art: start with everything blank
  await t('No art yet: explains instead of saving', async()=>{ const n0=await p.evaluate(()=>window.__saves.length); await p.click('#xJig'); await p.waitForTimeout(400);
    const st=await p.textContent('#status'); return ((await p.evaluate(()=>window.__saves.length))===n0 && /at least one skin/.test(st)) || st; });
  for (const [id,lab] of [['Base_Back_Plate','Back'],['End_Skin_01','Base end 01']]){ await p.click(`[data-slot="${id}"]`); await p.waitForTimeout(300); await p.setInputFiles('#file','fixtures/photo_12mp.jpg'); await p.waitForFunction(l=>document.getElementById('status').textContent.includes('added to '+l),lab); }
  let Z;
  await t('Saves 3Bay_Rectangle_Jig_Sheets.zip with art + guide per jig and a README', async()=>{ const n0=await p.evaluate(()=>window.__saves.length); await p.click('#xJig'); await p.waitForFunction(n=>window.__saves.length>n,n0,{timeout:120000});
    Z=await p.evaluate(async()=>{ const s=window.__saves.at(-1); const u=Uint8Array.from(atob(s.b64),c=>c.charCodeAt(0)); const dv=new DataView(u.buffer); const files=[]; let o=0;
      while (o+30<u.length && dv.getUint32(o,true)===0x04034b50){ const n=dv.getUint32(o+18,true), nl=dv.getUint16(o+26,true); const name=new TextDecoder().decode(u.subarray(o+30,o+30+nl)); files.push({name,start:o+30+nl,size:n}); o+=30+nl+n; }
      window.__zip={u,files}; return {zip:s.filename,names:files.map(f=>f.name)}; });
    const ok=Z.zip==='3Bay_Rectangle_Jig_Sheets.zip' && Z.names.length===5 && Z.names.filter(n=>/_art_/.test(n)).length===2 && Z.names.filter(n=>/_guide_/.test(n)).length===2 && Z.names.includes('README.txt');
    return ok || JSON.stringify(Z); });
  const probe=(file,pts)=>p.evaluate(async([file,pts])=>{ const f=window.__zip.files.find(x=>x.name.startsWith(file)); const bytes=window.__zip.u.slice(f.start,f.start+f.size);
      const dv=new DataView(bytes.buffer); const ppi=Math.round(dv.getUint32(41)*0.0254);
      const im=await createImageBitmap(new Blob([bytes],{type:'image/png'})); const c=new OffscreenCanvas(1,1), x=c.getContext('2d',{willReadFrequently:true});
      const J=JSON.parse(document.getElementById('plainEnds').textContent).jigs.find(j=>f.name.startsWith(j.name)); const k=im.width/J.w; const out={name:f.name,w:im.width,h:im.height,ppi,k:k*25.4,alpha:{}};
      for (const [id,fx,fy] of pts){ let X,Y; if (id==='margin'){ X=fx*k; Y=fy*k; } else { const it=J.items.find(i=>i.id===id); X=(it.x+it.w*fx)*k; Y=(J.h-it.y-it.h*fy)*k; }
        x.clearRect(0,0,1,1); x.drawImage(im,X,Y,1,1,0,0,1,1); out.alpha[id+'@'+fx+','+fy]=x.getImageData(0,0,1,1).data[3]; }
      return out; },[file,pts]);
  await t('Jig A art: true jig size and ppi tag matches the file name', async()=>{ const r=await probe('Jig_A_Skins_art',[]); const J=await p.evaluate(()=>JSON.parse(document.getElementById('plainEnds').textContent).jigs[0]);
    const ok=Math.abs(r.w-J.w*r.ppi/25.4)<=2 && Math.abs(r.h-J.h*r.ppi/25.4)<=2 && r.name.includes(`_${r.ppi}ppi`) && r.name.includes(`${J.w.toFixed(1)}x${J.h.toFixed(1)}mm`); return ok || JSON.stringify(r); });
  await t('Jig A art: your art sits in the Back and Base end 01 pockets', async()=>{ const r=await probe('Jig_A_Skins_art',[['Base_Back_Plate',0.5,0.5],['End_Skin_01',0.5,0.25]]); return Object.values(r.alpha).every(a=>a>200) || JSON.stringify(r.alpha); });
  await t('Jig A art: empty pockets and the jig margin stay clear (no sample art printed)', async()=>{ const r=await probe('Jig_A_Skins_art',[['Lid_Front_Plate',0.5,0.5],['Lid_End_03',0.5,0.5],['margin',2,2]]); return Object.values(r.alpha).every(a=>a===0) || JSON.stringify(r.alpha); });
  await t('Jig A art: Base end 01 is cut to its shape (corner above the slant is clear)', async()=>{ const r=await probe('Jig_A_Skins_art',[['End_Skin_01',0.95,0.9]]); return Object.values(r.alpha).every(a=>a===0) || JSON.stringify(r.alpha); });
  await t('Guide sheet: outlines drawn at every pocket', async()=>{ const r=await probe('Jig_A_Skins_guide',[['Lid_Front_Plate',0.2,0.5],['Lid_Inner_01',0.5,0.5]]); return Object.values(r.alpha).every(a=>a>0) || JSON.stringify(r.alpha); });
  await t('Liner numbers alone count as art on jig B', async()=>{ await p.click('[data-slot="Lid_Liner"]'); await p.waitForTimeout(300); await p.check('#numOn'); await p.waitForTimeout(200);
    const n0=await p.evaluate(()=>window.__saves.length); await p.click('#xJig'); await p.waitForFunction(n=>window.__saves.length>n,n0,{timeout:120000});
    await p.evaluate(()=>{ const s=window.__saves.at(-1); const u=Uint8Array.from(atob(s.b64),c=>c.charCodeAt(0)); const dv=new DataView(u.buffer); const files=[]; let o=0;
      while (o+30<u.length && dv.getUint32(o,true)===0x04034b50){ const n=dv.getUint32(o+18,true), nl=dv.getUint16(o+26,true); files.push({name:new TextDecoder().decode(u.subarray(o+30,o+30+nl)),start:o+30+nl,size:n}); o+=30+nl+n; } window.__zip={u,files}; });
    const r=await p.evaluate(async()=>{ const f=window.__zip.files.find(x=>x.name.startsWith('Jig_B_Liner_Insert_art')); const im=await createImageBitmap(new Blob([window.__zip.u.slice(f.start,f.start+f.size)],{type:'image/png'}));
      const c=new OffscreenCanvas(im.width,im.height), x=c.getContext('2d'); x.drawImage(im,0,0); const d=x.getImageData(0,0,im.width,im.height).data; let n=0; for (let i=3;i<d.length;i+=16) if (d[i]>0) n++; return n; });
    return r>1000 || `only ${r} painted pixels`; });
  await t('No page errors', async()=> errs.length===0 || errs.join(' | '));
  const passed=res.filter(Boolean).length; console.log(`${passed}/${res.length} passed`); await b.close(); process.exit(passed===res.length?0:1);
})();
