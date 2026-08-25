v4.3.1 修正

1. purin_walk.png：黑色底改為真正透明。
2. usagi_dash.png：黑色底改為真正透明。
3. travel_ticket.png：同樣發現黑色底，順手一起修正。
4. 每日 D1–D10 小角色取消進場動畫，切換日期立即顯示。
5. Service Worker cache 更新為 v4.3.1，避免手機繼續讀舊黑底圖片。

若目前是 v4.3.0：
GitHub 請更新：
- index.html
- style.css
- app.js
- sw.js
- manifest.json
- purin_walk.png
- usagi_dash.png
- travel_ticket.png

firebase-config.js 不要動。
