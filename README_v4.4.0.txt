Kyushu 2026 Oct — v4.4.0 Layout & UX Polish

這版依照討論完成：
- 布丁狗／烏薩奇探頭動畫改為可重複出現，6 秒 cooldown，不再整個 session 只出現一次。
- 「共同花費」改為「記帳」；面板改「旅費記帳」。
- 「共用記事」改為「記事」；面板改「旅行記事」。
- D1–D10 每日小圖改成輕量 WebP + 頁面載入時預先 decode，解決後面日期圖慢出現。
- 每日行程與首頁移除楓葉裝飾。
- 首頁整排旅行貼紙移除。
- Aa 提高 z-index 並保留右上安全區。
- 移除 Tap 換貼紙文字，改為 5 顆 carousel dots；可點圖或點 dots 切換。
- 今日提醒移除浮動 memo 標籤，改成不覆蓋文字的固定 header。
- 每日 timeline 最後新增「今晚住這裡／返台前據點」卡；飯店名稱與導航從登入後的私人行程資料動態推導，不寫死在公開程式碼。
- 美食頁頂端新增「附近找吃的」快速入口，點擊後從底部開啟 Google Maps 類別選單。
- Service Worker 改用較精簡的離線核心素材，避免每次更新先下載大量無關大圖。

GitHub 更新：
- index.html
- style.css
- app.js
- sw.js
- manifest.json
- daily-d1.webp ~ daily-d10.webp
- stamp-plane.webp / stamp-train.webp / stamp-onsen.webp / stamp-camera.webp
- ui-cloud.webp / ui-coffee.webp / ui-suitcase.webp / ui-purin-tip.webp / hotel-purin.webp

firebase-config.js 不要覆蓋。Firebase Database / Auth / Rules 不需變更。
