/* PM MKG - service worker
   VERSI cukup dinaikkan jika file statis (ikon/manifest) berubah.
   index.html sudah network-first, jadi selalu mengambil versi terbaru saat ada sinyal. */
const VERSI='pm-mkg-v11';
const WAJIB=['./index.html'];                                   /* gagal di-cache = install gagal & diulang */
const OPSIONAL=['./','./manifest.json','./icon-192.png','./icon-512.png'];
const TIMEOUT_MS=4000;                                          /* sinyal lemah: setelah ini pakai cache */

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(VERSI)
    .then(c=>c.addAll(WAJIB).then(()=>Promise.all(OPSIONAL.map(u=>c.add(u).catch(()=>{})))))
    .then(()=>self.skipWaiting()));
});

self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys()
    .then(k=>Promise.all(k.filter(x=>x!==VERSI).map(x=>caches.delete(x))))
    .then(()=>self.clients.claim()));
});

function dariCache(){
  return caches.match('./index.html').then(h=>h||caches.match('./'));
}

self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.method!=='GET')return;
  const u=new URL(r.url);
  /* Apps Script (data), CDN, dan semua domain lain: langsung ke jaringan, tidak pernah di-cache di sini */
  if(u.origin!==location.origin)return;

  /* Halaman utama: jaringan dulu, tapi jika lambat (>TIMEOUT_MS) atau gagal pakai cache.
     Hanya respons sehat (ok, bukan redirect) yang disimpan, agar cache tidak tertimpa halaman error. */
  if(r.mode==='navigate'){
    let simpan=Promise.resolve();
    const net=fetch(r).then(res=>{
      if(res&&res.ok&&res.type==='basic'&&!res.redirected){
        const cp=res.clone();
        simpan=caches.open(VERSI).then(c=>c.put('./index.html',cp)).catch(()=>{});
      }
      return res;
    });
    e.waitUntil(net.then(()=>simpan,()=>{}));   /* biar cache tetap diperbarui walau respons cache sudah dipakai */
    const batas=new Promise(res=>setTimeout(()=>res(null),TIMEOUT_MS));

    e.respondWith((async()=>{
      try{
        const hasil=await Promise.race([net,batas]);
        if(hasil)return hasil;
        const h=await dariCache();
        return h||net;                          /* belum ada cache: tunggu jaringan */
      }catch(err){
        const h=await dariCache();
        if(h)return h;
        throw err;
      }
    })());
    return;
  }

  /* File statis (ikon, manifest): cache dulu, perbarui di latar belakang */
  e.respondWith(
    caches.match(r).then(h=>{
      const net=fetch(r).then(res=>{
        if(res&&res.ok){
          const cp=res.clone();
          caches.open(VERSI).then(c=>c.put(r,cp)).catch(()=>{});
        }
        return res;
      }).catch(()=>h||Response.error());
      e.waitUntil(net.catch(()=>{}));
      return h||net;
    })
  );
});