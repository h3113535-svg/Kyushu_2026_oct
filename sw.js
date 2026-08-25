const CACHE = "kyushu-private-v4.4.0";
const SHELL = [
  "./","./index.html","./style.css?v=440","./app.js?v=440",
  "./manifest.json","./firebase-config.js?v=430","./icon-192.png","./icon-512.png",
  "./buddy_hero.png","./buddy_celebrate.png","./buddy_chill.png","./buddy_eat.png","./buddy_success.png",
  "./purin_peek_edge.png","./purin_walk.png","./usagi_peek.png","./usagi_dash.png","./usagi_success.png","./usagi_weather.png",
  "./travel_shopping.png","./travel_ticket.png",
  "./daily-d1.webp","./daily-d2.webp","./daily-d3.webp","./daily-d4.webp","./daily-d5.webp",
  "./daily-d6.webp","./daily-d7.webp","./daily-d8.webp","./daily-d9.webp","./daily-d10.webp",
  "./stamp-plane.webp","./stamp-train.webp","./stamp-onsen.webp","./stamp-camera.webp",
  "./ui-cloud.webp","./ui-coffee.webp","./ui-suitcase.webp","./ui-purin-tip.webp","./hotel-purin.webp"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request, {cache:"no-store"})
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    fetch(event.request, {cache:"no-store"})
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request,{ignoreSearch:true}))
  );
});
