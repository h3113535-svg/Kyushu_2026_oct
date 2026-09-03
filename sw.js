const SHELL_CACHE = "kyushu-nov-shell-v1.11.10";
const RUNTIME_CACHE = "kyushu-nov-runtime-v1.11.10";
const OFFLINE_PACK_CACHE = "kyushu-nov-offline-pack-v1";
const OWNED_CACHE_PREFIXES = ["kyushu-nov-shell-", "kyushu-nov-runtime-"];

const SHELL = [
  "./",
  "./index.html",
  "./style.css?v=11110",
  "./app.js?v=11110",
  "./manifest.json",
  "./firebase-config.js?v=11110",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./nov_loading_scene.webp?v=160",
  "./nov_hero_main_a.webp?v=160",
  "./nov_hero_main_b.webp?v=130",
  "./wa-paper-texture.webp?v=160",
  "./wa-leaf-scatter.webp?v=160"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => {
        const owned = OWNED_CACHE_PREFIXES.some(prefix => key.startsWith(prefix));
        const current = key === SHELL_CACHE || key === RUNTIME_CACHE;
        // The manually downloaded offline pack intentionally survives app updates.
        return owned && !current ? caches.delete(key) : Promise.resolve(false);
      })))
      .then(() => self.clients.claim())
  );
});

async function cacheResponse(cacheName, request, response){
  if(!response || !response.ok) return response;
  try{
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }catch{}
  return response;
}

async function exactCached(request){
  return caches.match(request);
}

async function looseCached(request){
  return caches.match(request, {ignoreSearch:true});
}

async function networkFirst(request, fallback){
  try{
    const response = await fetch(request, {cache:"no-store"});
    return cacheResponse(RUNTIME_CACHE, request, response);
  }catch{
    return (await exactCached(request)) || (await looseCached(request)) || (fallback ? await looseCached(fallback) : undefined) || Response.error();
  }
}

async function cacheFirstImage(request){
  const hit = await exactCached(request);
  if(hit) return hit;
  try{
    const response = await fetch(request, {cache:"no-store"});
    return cacheResponse(RUNTIME_CACHE, request, response);
  }catch{
    return (await looseCached(request)) || Response.error();
  }
}

self.addEventListener("fetch", event => {
  if(event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if(url.origin !== self.location.origin) return;

  if(event.request.mode === "navigate"){
    event.respondWith(networkFirst(event.request, "./index.html"));
    return;
  }

  if(event.request.destination === "image"){
    event.respondWith(cacheFirstImage(event.request));
    return;
  }

  event.respondWith(networkFirst(event.request));
});
