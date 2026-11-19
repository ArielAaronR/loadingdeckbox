// In-memory stand-in for a Netlify Blobs store (the subset netlify/lib/artwork-core.mjs uses).
module.exports=function fakeStore(){
  const m=new Map();
  return { m,
    async get(key,{type}={}){ if (!m.has(key)) return null; const v=m.get(key);
      if (type==='json') return JSON.parse(new TextDecoder().decode(v));
      if (type==='arrayBuffer') return v.buffer.slice(v.byteOffset, v.byteOffset+v.byteLength);
      return new TextDecoder().decode(v); },
    async set(key,data){ m.set(key, new Uint8Array(data instanceof ArrayBuffer ? data : await new Response(data).arrayBuffer()).slice()); },
    async setJSON(key,obj){ m.set(key, new TextEncoder().encode(JSON.stringify(obj))); },
    async list({prefix=''}={}){ return {blobs:[...m.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}; } };
};
