/* Kyushu 2026 Oct PWA · v5.3.30 ImportedPlaces Boot Fix
 * Goals:
 * 1) static images are downloaded once and reused across app versions;
 * 2) app shell updates remain reliable;
 * 3) the app still opens fully offline;
 * 4) caches belonging to other GitHub Pages repos are never touched.
 */
const CACHE_PREFIX = "kyushu-oct-";
const SHELL_CACHE = "kyushu-oct-shell-v5.3.30";
const ASSET_CACHE = "kyushu-oct-assets-v1";
const RUNTIME_CACHE = "kyushu-oct-runtime-v1";
const LEGACY_BLOCKING_CACHES = /^kyushu-oct-(?:static|runtime)-v5\.3\.(?:20|21|22|23)$/;

// Small files that are expected to change when app code changes.
const SHELL = [
  "./index.html",
  "./app.js?v=5330",
  "./style.css?v=5330",
  "./manifest.json",
  "./firebase-config.js?v=430"
];

// Large/stable visual assets. This cache deliberately has a stable name across releases.
// If an image is actually replaced, bump only that image's ?v= token in the app/source list.
const ASSETS = [
  "./icon-192.png",
  "./icon-512.png",
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
  "./hero-cover-v51.webp?v=510",
  "./hotel-return-duo.webp?v=460",
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

function sameProject(url) {
  const scopePath = new URL(self.registration.scope).pathname;
  return url.origin === self.location.origin && url.pathname.startsWith(scopePath);
}

async function cacheResponse(cacheName, request, response) {
  if (!response || !response.ok) return response;
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  return response;
}

async function fetchFresh(request) {
  return fetch(request, { cache: "no-store" });
}

// Copy from any existing October cache before going to network. This is the key migration step:
// users upgrading from 5.3.20–5.3.23 do NOT re-download the ~20 MB visual asset set.
async function migrateOrFetchAsset(path) {
  const request = new Request(path, { cache: "default" });
  const existing = await caches.match(request);
  if (existing) {
    const target = await caches.open(ASSET_CACHE);
    await target.put(request, existing.clone());
    return;
  }
  const response = await fetchFresh(request);
  if (!response.ok) throw new Error(`Asset preload failed: ${path} (${response.status})`);
  const target = await caches.open(ASSET_CACHE);
  await target.put(request, response.clone());
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    // Shell is intentionally refreshed every release; it is small compared with image assets.
    const shellCache = await caches.open(SHELL_CACHE);
    for (const path of SHELL) {
      const request = new Request(path, { cache: "reload" });
      const response = await fetchFresh(request);
      if (!response.ok) throw new Error(`Shell preload failed: ${path} (${response.status})`);
      await shellCache.put(request, response.clone());
    }

    // Migrate cached images from the old versioned cache without re-downloading them.
    let cursor = 0;
    const workers = Array.from({ length: Math.min(4, ASSETS.length) }, async () => {
      while (cursor < ASSETS.length) {
        const path = ASSETS[cursor++];
        await migrateOrFetchAsset(path);
      }
    });
    await Promise.all(workers);

    // Never leave a new shell waiting behind an older Chrome/PWA worker.
    // Image assets remain in the shared asset cache, so this does not redownload them.
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keysBefore = await caches.keys();
    const migratingLegacy = keysBefore.some(key => LEGACY_BLOCKING_CACHES.test(key));
    const replacingOlderShell = keysBefore.some(key => key.startsWith("kyushu-oct-shell-") && key !== SHELL_CACHE);

    await Promise.all(keysBefore
      .filter(key => key.startsWith(CACHE_PREFIX))
      .filter(key => key !== SHELL_CACHE && key !== ASSET_CACHE && key !== RUNTIME_CACHE)
      .map(key => caches.delete(key))
    );

    await self.clients.claim();

    // Move open Chrome/PWA windows onto the new shell automatically.
    if (migratingLegacy || replacingOlderShell) {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      await Promise.all(clients.map(client => {
        try { return client.navigate(client.url); } catch { return null; }
      }));
    }
  })());
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

async function shellCacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(request, { ignoreSearch: false });
  if (hit) return hit;
  try {
    const response = await fetchFresh(request);
    return cacheResponse(SHELL_CACHE, request, response);
  } catch (error) {
    const fallback = await cache.match(request, { ignoreSearch: true });
    if (fallback) return fallback;
    throw error;
  }
}

async function assetCacheFirst(request) {
  const assetCache = await caches.open(ASSET_CACHE);
  const exact = await assetCache.match(request);
  if (exact) return exact;

  // Migration/fallback may find the same URL in an older cache on first access.
  const anyExact = await caches.match(request);
  if (anyExact) {
    assetCache.put(request, anyExact.clone()).catch(() => {});
    return anyExact;
  }

  try {
    const response = await fetch(request);
    if (response && response.ok) assetCache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (error) {
    const fallback = await caches.match(request, { ignoreSearch: true });
    if (fallback) return fallback;
    throw error;
  }
}

async function runtimeCacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (error) {
    const fallback = await caches.match(request, { ignoreSearch: true });
    if (fallback) return fallback;
    throw error;
  }
}

function isAssetRequest(request, url) {
  if (["image", "font"].includes(request.destination)) return true;
  return /\.(?:png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf)$/i.test(url.pathname);
}

function isShellRequest(url) {
  const name = url.pathname.split("/").pop();
  return ["index.html", "app.js", "style.css", "manifest.json", "firebase-config.js"].includes(name);
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  // Firebase, Google Places/Maps, exchange-rate API, and third-party CDN requests stay on network.
  if (!sameProject(url)) return;

  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      const shellCache = await caches.open(SHELL_CACHE);
      const cached = await shellCache.match("./index.html", { ignoreSearch: true });
      if (cached) return cached;
      try {
        const response = await fetchFresh(event.request);
        if (response && response.ok) shellCache.put("./index.html", response.clone()).catch(() => {});
        return response;
      } catch {
        return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }

  if (isShellRequest(url)) {
    event.respondWith(shellCacheFirst(event.request));
    return;
  }

  if (isAssetRequest(event.request, url)) {
    event.respondWith(assetCacheFirst(event.request));
    return;
  }

  event.respondWith(runtimeCacheFirst(event.request));
});
