v5.3.6 Manual Weather Buddy

Cumulative from v5.3.5 Character Voice Pass.

Changes:
- Weather Usagi is now decorative/manual only; it is NOT randomized and is NOT selected from real forecast data.
- Tap the Weather Usagi to cycle in a fixed order:
  sunny -> teru-teru-bouzu -> cloudy -> rain -> thunder -> snow -> sunny.
- The selected weather artwork is stored locally so refresh keeps the chosen look.
- Added five user-supplied weather artworks with transparent backgrounds:
  weather-sunny-usagi-v536.webp
  weather-teruteru-usagi-v536.webp
  weather-cloudy-usagi-v536.webp
  weather-thunder-usagi-v536.webp
  weather-snow-usagi-v536.webp
- Existing authoritative rain artwork remains weather-rain-usagi-v47.webp.
- Weather forecast rendering no longer changes the mascot artwork.
- Character speech bubbles now show character dialogue only; the secondary app-guidance subtitle is no longer rendered.
- Added short Usagi-only voice pools for thunder, snow and teru-teru modes.
- If the currently packaged build has no getWeather() implementation, the card shows a neutral out-of-range placeholder instead of an error state.
- Cache/version references aligned to 5.3.6 / v=536.

No Firebase migration required.
No private guide re-import required.
