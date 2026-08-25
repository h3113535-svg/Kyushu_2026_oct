const CACHE = "kyushu-private-v4.3.1";
const SHELL = [
  "./","./index.html","./style.css?v=431","./app.js?v=431",
  "./manifest.json","./firebase-config.js?v=430","./icon-192.png","./icon-512.png",
  "./buddy_celebrate.png",
  "./buddy_chill.png",
  "./buddy_eat.png",
  "./buddy_hero.png",
  "./buddy_success.png",
  "./purin_surprise.png",
  "./purin_clap.png",
  "./purin_lie.png",
  "./purin_pudding.png",
  "./purin_beret.png",
  "./purin_spoon.png",
  "./purin_spoon_alt.png",
  "./purin_paw.png",
  "./purin_peek.png",
  "./purin_peek_edge.png",
  "./purin_walk.png",
  "./usagi_excited.png",
  "./usagi_point.png",
  "./usagi_think.png",
  "./usagi_sleep.png",
  "./usagi_stars.png",
  "./usagi_motion.png",
  "./usagi_sweat.png",
  "./usagi_peek.png",
  "./usagi_dash.png",
  "./usagi_success.png",
  "./travel_suitcase.png",
  "./travel_ticket.png",
  "./travel_cloud.png",
  "./travel_coffee.png",
  "./travel_camera.png",
  "./travel_plane.png",
  "./travel_train.png",
  "./travel_maple.png",
  "./travel_onsen.png",
  "./travel_shopping.png"
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
