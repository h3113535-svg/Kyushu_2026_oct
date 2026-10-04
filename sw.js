/* Kyushu 2026 Oct · v5.3.45 Auth Recovery
 * Purpose: break stale shell/firebase-config cache without touching IndexedDB.
 */
const CACHE_PREFIX = "kyushu-oct-";
const SHELL_CACHE = "kyushu-oct-shell-v5.3.45-authfix1";
const SHELL = [
  "./index.html",
  "./app.js?v=5345",
  "./style.css?v=5345",
  "./manifest.json",
  "./firebase-config.js?v=545-authfix1"
];

async function fetchFresh(req){ return fetch(req,{cache:"no-store"}); }

self.addEventListener("install", event => {
  event.waitUntil((async()=>{
    const cache=await caches.open(SHELL_CACHE);
    for(const path of SHELL){
      try{
        const req=new Request(path,{cache:"reload"});
        const res=await fetchFresh(req);
        if(res && res.ok) await cache.put(req,res.clone());
      }catch(e){ /* one failed file must not block SW activation */ }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX) && k!==SHELL_CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
    const clients=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    await Promise.all(clients.map(c=>{ try{return c.navigate(c.url)}catch{return null} }));
  })());
});

self.addEventListener("message", event=>{
  if(event.data?.type==="SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", event=>{
  if(event.request.method!=="GET") return;
  const url=new URL(event.request.url);
  const scopePath=new URL(self.registration.scope).pathname;
  if(url.origin!==self.location.origin || !url.pathname.startsWith(scopePath)) return;

  const name=url.pathname.split('/').pop();
  const isShell=["index.html","app.js","style.css","manifest.json","firebase-config.js"].includes(name);
  if(event.request.mode==="navigate" || isShell){
    event.respondWith((async()=>{
      const cache=await caches.open(SHELL_CACHE);
      try{
        const res=await fetchFresh(event.request);
        if(res && res.ok){
          const key=event.request.mode==="navigate" ? new Request("./index.html") : event.request;
          await cache.put(key,res.clone());
        }
        return res;
      }catch(e){
        const hit=event.request.mode==="navigate"
          ? await cache.match("./index.html",{ignoreSearch:true})
          : await cache.match(event.request,{ignoreSearch:true});
        if(hit) return hit;
        throw e;
      }
    })());
  }
});
