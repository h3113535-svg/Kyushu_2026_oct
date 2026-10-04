/* Kyushu 2026 Oct PWA · v5.3.55 Stable Rollback
 * Visual/app baseline: v5.3.46.
 * This worker intentionally avoids reusing older Kyushu caches.
 * IndexedDB booking attachments are NOT touched.
 */
const CACHE_PREFIX = "kyushu-oct-";
const SHELL_CACHE = "kyushu-oct-shell-v5.3.55";
const ASSET_CACHE = "kyushu-oct-assets-v555-rollback";
const RUNTIME_CACHE = "kyushu-oct-runtime-v555";
const SHELL = [
  "./index.html",
  "./app.js?v=5355",
  "./style.css?v=5355",
  "./manifest.json?v=5355",
  "./firebase-config.js?v=430"
];

async function fetchFresh(request){ return fetch(request,{cache:"no-store"}); }

self.addEventListener("install", event => {
  event.waitUntil((async()=>{
    const cache=await caches.open(SHELL_CACHE);
    for(const path of SHELL){
      const req=new Request(path,{cache:"reload"});
      const res=await fetchFresh(req);
      if(!res.ok) throw new Error(`Shell preload failed: ${path} (${res.status})`);
      await cache.put(req,res.clone());
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys
      .filter(k=>k.startsWith(CACHE_PREFIX))
      .filter(k=>![SHELL_CACHE,ASSET_CACHE,RUNTIME_CACHE].includes(k))
      .map(k=>caches.delete(k)));
    await self.clients.claim();
    const clients=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    await Promise.all(clients.map(c=>{ try{return c.navigate(c.url)}catch{return null} }));
  })());
});

self.addEventListener("message", event=>{
  if(event.data?.type==="SKIP_WAITING") self.skipWaiting();
});

async function networkFirst(request, cacheName){
  const cache=await caches.open(cacheName);
  try{
    const res=await fetchFresh(request);
    if(res?.ok) await cache.put(request,res.clone());
    return res;
  }catch(err){
    const hit=await cache.match(request,{ignoreSearch:false}) || await cache.match(request,{ignoreSearch:true});
    if(hit) return hit;
    throw err;
  }
}

async function assetNetworkFirst(request){
  const cache=await caches.open(ASSET_CACHE);
  try{
    const res=await fetch(request,{cache:"reload"});
    if(res?.ok) cache.put(request,res.clone()).catch(()=>{});
    return res;
  }catch(err){
    const hit=await cache.match(request,{ignoreSearch:false}) || await cache.match(request,{ignoreSearch:true});
    if(hit) return hit;
    throw err;
  }
}

function sameProject(url){
  const scopePath=new URL(self.registration.scope).pathname;
  return url.origin===self.location.origin && url.pathname.startsWith(scopePath);
}
function isAsset(request,url){
  return ["image","font"].includes(request.destination) || /\.(?:png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf)$/i.test(url.pathname);
}
function isShell(url){
  const name=url.pathname.split("/").pop();
  return ["","index.html","app.js","style.css","manifest.json","firebase-config.js"].includes(name);
}

self.addEventListener("fetch", event=>{
  if(event.request.method!=="GET") return;
  const url=new URL(event.request.url);
  if(!sameProject(url)) return;
  if(event.request.mode==="navigate" || isShell(url)){
    event.respondWith(networkFirst(event.request,SHELL_CACHE));
    return;
  }
  if(isAsset(event.request,url)){
    event.respondWith(assetNetworkFirst(event.request));
    return;
  }
  event.respondWith(networkFirst(event.request,RUNTIME_CACHE));
});
