// Hosted-site check: no Claude runtime, so exports must arrive as normal browser downloads
const {chromium}=require('playwright'),fs=require('fs');
const W=process.env.APP||'../';
(async()=>{ const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']}); const c=await b.newContext({acceptDownloads:true,viewport:{width:1440,height:900}}); const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/*',r=>{const u=r.request().url();
    if(u.includes('three@0.160.0/'))return r.fulfill({path:'node_modules/three/'+u.split('three@0.160.0/')[1],contentType:'application/javascript',headers:{'Access-Control-Allow-Origin':'*'}});
    if(u.startsWith('http://app/'))return r.fulfill({body:fs.readFileSync(W+'index.html','utf8'),contentType:'text/html'}); return r.abort(); });
  await p.goto('http://app/'); await p.waitForFunction(()=>document.getElementById('loading').hidden);
  const ok=[];
  ok.push(['export buttons enabled', !(await p.isDisabled('#xOne'))]);
  await p.setInputFiles('#file','fixtures/photo_12mp.jpg'); await p.waitForTimeout(800);
  const [d1]=await Promise.all([p.waitForEvent('download'), p.click('#xOne')]); const f1=await d1.path();
  ok.push(['PNG downloads ('+d1.suggestedFilename()+')', /Lid_Top_177.8x72.1mm_600ppi\.png/.test(d1.suggestedFilename()) && fs.statSync(f1).size>10000]);
  const [d2]=await Promise.all([p.waitForEvent('download',{timeout:60000}), p.click('#xAll')]);
  ok.push(['ZIP downloads ('+d2.suggestedFilename()+')', d2.suggestedFilename()==='3Bay_Case_Skins_600ppi.zip']);
  ok.push(['no script errors', errs.length===0]);
  for (const [n,v] of ok) console.log((v?'PASS ':'FAIL ')+n); console.log(ok.filter(x=>x[1]).length+'/'+ok.length+' passed'); await b.close(); })();
