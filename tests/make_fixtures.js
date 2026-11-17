// Creates the two test photos (12 MP noise JPG, 54 MP flat JPG) in fixtures/
const {chromium}=require('playwright'),fs=require('fs');
(async()=>{ const b=await chromium.launch(); const p=await b.newPage();
  const make=async(w,h,noise)=>Buffer.from(await p.evaluate(async([w,h,noise])=>{ const c=new OffscreenCanvas(w,h), x=c.getContext('2d');
    if (noise){ const d=x.createImageData(w,h); for (let i=0;i<d.data.length;i++) d.data[i]=(i%4===3)?255:Math.random()*255; x.putImageData(d,0,0); } else { x.fillStyle='#c8283c'; x.fillRect(0,0,w,h); }
    const bl=await c.convertToBlob({type:'image/jpeg',quality:0.9}); return [...new Uint8Array(await bl.arrayBuffer())]; },[w,h,noise]));
  fs.writeFileSync('fixtures/photo_12mp.jpg',await make(4000,3000,true)); fs.writeFileSync('fixtures/photo_54mp.jpg',await make(9000,6000,false));
  console.log('fixtures ready'); await b.close(); })();
