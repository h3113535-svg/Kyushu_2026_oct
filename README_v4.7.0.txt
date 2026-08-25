v4.7.0 Buddy Dialogue

旅行日期
- 2026/10/09–2026/10/18（日本時間）
- 若 Firebase content 缺少 startDate/endDate，畫面會以此正式日期作為 fallback。
- TODAY 自動開啟仍依 Asia/Tokyo 日期比對 D1–D10。

本版更新
1. 全面加入情境角色台詞庫：
   - 布丁狗通用
   - 烏薩奇通用（含：蛤？／嗚拉／呀哈！／嗚拉呀哈呀哈嗚拉～／哼～？／噗嚕）
   - 雙角色（新增：我們是鴨寶幫！）
   - 天氣、美食、訂位搶票、購物、記帳、記事、飯店、D1–D10、時間、彩蛋
2. 天氣 WEATHER03 改為「拍照日！」。
3. 每日主題圖點擊時優先出現該日專屬台詞。
4. 天氣／美食／Booking／購物／記帳／記事／飯店角色會說對應情境台詞。
5. 完成美食、購物、Booking 任務時會從對應完成台詞池抽一句。
6. 日本時間 21:00 後點飯店角色，優先使用晚間休息台詞。
7. 一般角色點擊有低機率使用日本當地早／午／晚／深夜台詞。
8. 不同情境使用不同 Toast 色與粒子符號；不新增 generic 角色 Emoji。
9. 每日布丁狗散步與 24h 搶票衝刺的「每天一次」規則保留。
10. 10/09 第一次於旅程當日開啟 Buddy theme，加入「九州旅程 START！」彩蛋。
11. 雨衣烏薩奇改成使用者新提供圖片 weather-rain-usagi-v47.webp。

從 v4.6.2 更新 GitHub：
- index.html
- style.css
- app.js
- sw.js
- manifest.json
- weather-rain-usagi-v47.webp

firebase-config.js 不要動。
Firebase Database / Rules / 私人行程資料不用重新匯入。
