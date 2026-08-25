v4.6.2 Weather mascot fix

- 天氣卡不再使用新生成的四耳雨衣圖 weather-rain-usagi.webp。
- 改回既有、造型正確的 usagi_weather.png（只有兩隻耳朵）。
- 更新 Service Worker cache，避免手機繼續顯示舊圖。

從 v4.6.1 更新只需：index.html、app.js、sw.js、manifest.json。
style.css、Firebase、圖片都不用重傳。
