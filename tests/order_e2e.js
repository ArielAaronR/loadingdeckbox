// Order form: summary matches the price panel, art uploads in chunks, the Netlify form gets every field,
// and the emailed link gives back a ZIP of exactly the plates with art. /api/artwork runs the real
// function code against an in-memory store; the Netlify form POST to / is captured.
const {chromium}=require('playwright'),fs=require('fs'),JSZip=require('jszip'); const W=process.env.APP||'../';
const fakeStore=require('./fake_blobs');
const res=[]; const t=async(n,f)=>{ let r; try{ r=await f(); }catch(e){ r=e.message.split('\n')[0]; } const ok=r===true; res.push(ok); console.log((ok?'PASS ':'FAIL ')+n+(ok?'':' — '+r)); };
(async()=>{ const {handle}=await import('../netlify/lib/artwork-core.mjs');
  const store=fakeStore(), forms=[], puts=[]; let failForm=false;
  const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']}); const ctx=await b.newContext({viewport:{width:1440,height:900},acceptDownloads:true}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(()=>{ try{ localStorage.setItem('loadingdeck:tour:v1','dismissed'); }catch(e){} });
  await ctx.route('**/*',async r=>{ const q=r.request(), u=q.url();
    if (u.includes('three@0.160.0/')) return r.fulfill({path:'node_modules/three/'+u.split('three@0.160.0/')[1],contentType:'application/javascript',headers:{'Access-Control-Allow-Origin':'*'}});
    if (u.startsWith('http://app/api/artwork')){ const body=['PUT','POST'].includes(q.method())?q.postDataBuffer():undefined; if (q.method()==='PUT') puts.push(body?.length||0);
      const out=await handle(new Request(u,{method:q.method(),body}),store); const headers={}; out.headers.forEach((v,k)=>headers[k]=v);
      return r.fulfill({status:out.status,headers,body:Buffer.from(await out.arrayBuffer())}); }
    if (u.startsWith('http://app/') && q.method()==='POST'){ if (failForm) return r.fulfill({status:500,body:'x'}); forms.push(Object.fromEntries(new URLSearchParams(q.postData()))); return r.fulfill({status:200,body:'ok'}); }
    if (u.startsWith('http://app/')) return r.fulfill({body:fs.readFileSync(W+'index.html','utf8'),contentType:'text/html'});
    return r.abort(); });
  const load=async()=>{ await p.waitForFunction(()=>document.getElementById('loading').hidden); await p.waitForTimeout(300); };
  await p.goto('http://app/'); await load();
  const addPhoto=async id=>{ await p.click(`[data-slot="${id}"]`); await p.waitForTimeout(150); await p.setInputFiles('#file','fixtures/photo_12mp.jpg'); await p.waitForTimeout(1500); };
  const addText=async id=>{ await p.click(`[data-slot="${id}"]`); await p.waitForTimeout(150); await p.click('#addText'); await p.waitForTimeout(250); };

  await t('Order button opens a labelled form with the same total as the panel', async()=>{ await addPhoto('Lid_Top'); await addText('Base_Back_Plate'); await addText('End_Skin_01');
    await p.check('#springOn'); await p.click('[data-fil="#2a2c30"]'); await p.waitForTimeout(150);
    await p.click('#orderBtn'); await p.waitForTimeout(200);
    const open=await p.evaluate(()=>document.getElementById('orderDlg').open), tot=await p.textContent('#orderTotal'), panel=await p.textContent('#priceTotal');
    return (open && tot===panel && tot==='$41') || `${open} ${tot} ${panel}`; });
  await t('Name and email are required', async()=>{ await p.click('#orderSend'); await p.waitForTimeout(200);
    return (forms.length===0 && puts.length===0 && await p.evaluate(()=>!document.querySelector('#orderForm input[name=email]').checkValidity())) || 'sent without details'; });
  await t('Sending uploads the art in chunks and posts the Netlify form', async()=>{
    await p.fill('#orderForm input[name=name]','Test Buyer'); await p.fill('#orderForm input[name=email]','buyer@example.com'); await p.fill('#orderForm textarea[name=notes]','Gift');
    await p.click('#orderSend'); await p.waitForFunction(()=>!document.getElementById('orderDone').hidden || /try again/.test(document.getElementById('orderStatus').textContent),null,{timeout:120000});
    if (!(await p.isVisible('#orderDone'))) return 'status: '+await p.textContent('#orderStatus');
    return (forms.length===1 && puts.length>=1 && puts.every(n=>n<=3*1024*1024)) || `forms ${forms.length} puts ${puts}`; });
  const F=forms[0]||{};
  await t('Form has every order field', ()=>{ const want={'form-name':'order',name:'Test Buyer',email:'buyer@example.com',notes:'Gift',case_version:'Strap loops',colour:'Black',spring:'Yes (+$5)',total:'$41','bot-field':''};
    if (F.subject!==`[Loading Deck] Order ${F.order_number} · Strap loops · $41`) return 'subject='+F.subject;
    for (const [k,v] of Object.entries(want)) if (F[k]!==v) return `${k}=${JSON.stringify(F[k])}`;
    return (/^[0-9A-F]{8}$/.test(F.order_number) && F.plates==='Lid top $3.50, Back $2, End 01 $0.50' && /^http:\/\/app\/api\/artwork\?order=[0-9a-f-]{36}$/.test(F.artwork)) || JSON.stringify(F); });
  await t('Confirmation shows the order number and email', async()=>{ const m=await p.textContent('#orderDoneMsg'); return (m.includes(F.order_number) && m.includes('buyer@example.com') && m.includes('$41')) || m; });
  await t('Emailed link downloads a ZIP of just the plates with art', async()=>{ const page=await ctx.newPage(); await page.goto(F.artwork);
    const [dl]=await Promise.all([page.waitForEvent('download'), page.click('#go')]); const path=await dl.path(); await page.close();
    const zip=await JSZip.loadAsync(fs.readFileSync(path)); const names=Object.keys(zip.files).sort();
    const want=['Base_Back_Plate_168.0x40.8mm_600ppi.png','End_Skin_01_45.1x37.6mm_600ppi.png','Lid_Top_177.8x72.1mm_600ppi.png','README.txt'];
    return (JSON.stringify(names)===JSON.stringify(want) && dl.suggestedFilename()===`Order_${F.order_number}_3Bay_Case_Skins_600ppi.zip`) || names.join(',')+' '+dl.suggestedFilename(); });
  await t('A failed send says so and keeps the form open', async()=>{ failForm=true; await p.click('#orderClose'); await p.click('#orderBtn'); await p.waitForTimeout(150);
    await p.click('#orderSend'); await p.waitForFunction(()=>/could not be sent/.test(document.getElementById('orderStatus').textContent),null,{timeout:120000});
    const ok=await p.isVisible('#orderForm') && !(await p.isDisabled('#orderSend')); failForm=false; return ok || 'form locked'; });
  await t('Plain box (no art) orders without an upload', async()=>{ await p.click('#orderCancel'); await p.click('#xReset'); await p.click('#xReset'); await p.waitForTimeout(500); const before=puts.length, n=forms.length;
    if ((await p.textContent('#priceTotal'))!=='$35') return 'reset did not clear art: '+await p.textContent('#priceTotal');
    await p.click('#orderBtn'); await p.click('#orderSend'); await p.waitForSelector('#orderDone:not([hidden])',{timeout:30000});
    const G=forms.at(-1); return (forms.length===n+1 && puts.length===before && G.artwork==='No art (plain box)' && G.plates==='None (plain box)' && G.total==='$35') || JSON.stringify(G); });
  await t('No script errors', ()=>errs.length===0 || errs.join(' | '));
  const pass=res.filter(Boolean).length; console.log(pass+'/'+res.length+' passed'); await b.close(); process.exit(pass===res.length?0:1); })();
