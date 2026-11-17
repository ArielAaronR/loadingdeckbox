// The public page must not carry a printable case: every embedded 3D mesh is the coarse display copy
// (all vertices on the 0.8 mm grid, surface not closed) and nothing links to print files.
// No browser needed.
const fs=require('fs'); const W=process.env.APP||'../';
const html=fs.readFileSync(W+'index.html','utf8');
const res=[]; const t=(n,f)=>{ let r; try{ r=f(); }catch(e){ r=e.message; } const ok=r===true; res.push(ok); console.log((ok?'PASS ':'FAIL ')+n+(ok?'':' — '+r)); };
const json=id=>JSON.parse(html.match(new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`))[1]);
const meshes=[...json('mesh').map(m=>[m.n,m]), ...Object.entries(json('plainEnds').meshes).map(([k,m])=>['plain:'+k,m]),
  ...Object.entries(json('lidDivider')).map(([k,d])=>['divider:'+k,d.mesh])];
const GRID=8;   // 0.8 mm in the page's 0.1 mm units
const dec=m=>({P:new Int16Array(Uint8Array.from(Buffer.from(m.p,'base64')).buffer), I:new Uint16Array(Uint8Array.from(Buffer.from(m.i,'base64')).buffer)});

t('Every case, lid, insert, latch and divider mesh is present', ()=> meshes.length===8 || `${meshes.length} meshes: ${meshes.map(m=>m[0])}`);
t('All display vertices sit on the 0.8 mm grid (coarse copy, not the print geometry)', ()=>{
  for (const [n,m] of meshes){ const {P}=dec(m); const off=P.findIndex(v=>v%GRID!==0); if (off>=0) return `${n}: vertex value ${P[off]/10} mm is off the grid`; }
  return true; });
t('No display mesh is a closed solid', ()=>{
  for (const [n,m] of meshes){ const {I}=dec(m), E=new Map();
    for (let k=0;k<I.length;k+=3) for (const [a,b] of [[I[k],I[k+1]],[I[k+1],I[k+2]],[I[k+2],I[k]]]){ const key=a<b?a*65536+b:b*65536+a; E.set(key,(E.get(key)||0)+1); }
    if ([...E.values()].every(c=>c===2)) return `${n} is watertight`; }
  return true; });
t('No links to print files or private tools', ()=>{ const m=html.match(/href="[^"]*\.(3mf|stl|step)"|["'(]print\/|["'(]tools\//i); return !m || `found ${m[0]}`; });

const pass=res.filter(Boolean).length; console.log(pass+'/'+res.length+' passed'); process.exit(pass===res.length?0:1);
