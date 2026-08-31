const CACHE_PREFIX = "kyushu-oct-";
const STATIC_CACHE = "kyushu-oct-static-v5.3.23";
const RUNTIME_CACHE = "kyushu-oct-runtime-v5.3.23";

// All same-origin assets that the current app actually references. They are downloaded once when
// this Service Worker installs, then served Cache First so reopening the PWA does not repeatedly
// consume roaming data. Firebase/Google external requests are intentionally outside this cache.
const PRECACHE = [
  "./",
  "./index.html",
  "./app.js?v=5323",
  "./booking-check-purin.webp?v=460",
  "./booking-dash-usagi.webp?v=460",
  "./buddy_celebrate.png?v=430",
  "./buddy_chill.png?v=430",
  "./buddy_eat.png?v=430",
  "./buddy_hero.png?v=430",
  "./buddy_success.png?v=430",
  "./day-scene-v52-01.webp?v=520",
  "./day-scene-v52-02.webp?v=520",
  "./day-scene-v52-03.webp?v=520",
  "./day-scene-v52-04.webp?v=520",
  "./day-scene-v52-05.webp?v=520",
  "./day-scene-v52-06.webp?v=520",
  "./day-scene-v52-07.webp?v=520",
  "./day-scene-v52-08.webp?v=520",
  "./day-scene-v52-09.webp?v=520",
  "./day-scene-v52-10.webp?v=520",
  "./duck_gang.png?v=5311",
  "./egg-cry-v539.png?v=539",
  "./egg-home-sleep-v539.png?v=539",
  "./egg-sendoff-v539.png?v=539",
  "./firebase-config.js?v=430",
  "./hero-cover-v51.webp?v=510",
  "./hotel-return-duo.webp?v=460",
  "./icon-192.png",
  "./icon-512.png",
  "./manifest.json",
  "./mini-purin-clap.webp",
  "./mini-purin-hero.webp",
  "./mini-purin-lie.webp",
  "./mini-purin-surprise.webp",
  "./mini-usagi-excited.webp",
  "./mini-usagi-point.webp",
  "./mini-usagi-sticker.webp",
  "./mini-usagi-success.webp",
  "./purin-food-ui.png?v=380",
  "./purin_clap.png?v=430",
  "./purin_peek_edge.png?v=430",
  "./purin_pudding.png?v=430",
  "./purin_spoon.png?v=430",
  "./purin_surprise.png?v=430",
  "./purin_tip.png?v=430",
  "./purin_walk.png?v=431",
  "./seal_gang.png?v=5311",
  "./secret-life-block-building.webp?v=5319",
  "./secret-life-ditto-usagi.webp?v=5319",
  "./secret-life-hide-and-seek.webp?v=5319",
  "./secret-life-hotpot-party.webp?v=5319",
  "./secret-life-house-mess.webp?v=5319",
  "./secret-life-midnight-snack.webp?v=5319",
  "./secret-life-olaf-bed.webp?v=5319",
  "./secret-life-pillow-fight.webp?v=5319",
  "./secret-life-seal-gang-mission.webp?v=5319",
  "./secret-life-sofa-battle.webp?v=5319",
  "./secret-life-want-to-travel.webp?v=5319",
  "./secret-life-watchduty-sleep.webp?v=5319",
  "./style.css?v=5323",
  "./travel_camera.png?v=430",
  "./travel_coffee.png?v=430",
  "./travel_shopping.png?v=430",
  "./travel_suitcase.png?v=430",
  "./travel_ticket.png?v=431",
  "./ui-cloud.webp?v=440",
  "./ui-coffee.webp?v=440",
  "./ui-purin-tip.webp?v=440",
  "./ui-suitcase.webp?v=440",
  "./usagi_dash.png?v=430",
  "./usagi_dash.png?v=431",
  "./usagi_excited.png?v=430",
  "./usagi_peek.png?v=430",
  "./usagi_point.png?v=430",
  "./usagi_sticker.png?v=430",
  "./usagi_success.png?v=430",
  "./usagi_think.png?v=430",
  "./weather-cloudy-usagi-v536.webp?v=536",
  "./weather-rain-usagi-v47.webp?v=470",
  "./weather-snow-usagi-v536.webp?v=536",
  "./weather-sunny-usagi-v536.webp?v=536",
  "./weather-teruteru-usagi-v536.webp?v=536",
  "./weather-thunder-usagi-v536.webp?v=536"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(request) {
  const staticHit = await caches.match(request);
  if (staticHit) return staticHit;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    // Last chance for assets whose only difference is an old cache-busting query string.
    const fallback = await caches.match(request, {ignoreSearch:true});
    if (fallback) return fallback;
    throw error;
  }
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const scopePath = new URL(self.registration.scope).pathname;

  // Do not intercept Firebase, Google Maps, CDN scripts, or assets belonging to another GitHub Pages repo.
  if (url.origin !== self.location.origin || !url.pathname.startsWith(scopePath)) return;

  if (event.request.mode === "navigate") {
    event.respondWith((async()=>{
      const cached = await caches.match("./index.html");
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response && response.ok) {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put("./index.html", response.clone()).catch(() => {});
        }
        return response;
      } catch (error) {
        return new Response("Offline", {status:503, headers:{"Content-Type":"text/plain; charset=utf-8"}});
      }
    })());
    return;
  }

  event.respondWith(cacheFirst(event.request));
});
