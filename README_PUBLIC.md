# Kyushu_2026_oct — v4.2.0 旅伴手帳

公開 GitHub Pages 只包含 UI、Firebase Auth 與角色素材，不包含私人行程內容。
私人行程仍由 Firebase Authentication + Realtime Database Rules 保護。

## 本版主要更新
- 旅伴主題完整重排
- 雙角色 Hero
- Food / Booking / Shopping / Notes 情境角色
- 探頭、完成慶祝、星星彩蛋等微互動
- 旅行圖示與秋季裝飾

不要把 PrivateSetup / trip-content.json 上傳到 GitHub。


更新：v5.0.0 Home Hero Refresh — 首頁主圖改為新的旅行插圖。

更新：v5.3.7 Hero + Weather Interaction Cleanup — 首頁單點不再說話／位移，天氣角色改為卡片內對話泡泡。


更新：v5.3.10 Egg Stability + Typography Fix — 首頁長按彩蛋開啟後鎖定同一張圖直到點背景關閉；阻止其他 celebration 覆蓋彩蛋；角色泡泡與底部文字縮小並限制在卡片內，長句自動安全排版。


更新：v5.3.11 Home Egg Asset Refresh + Dash Marquee — 首頁長按彩蛋池改為 6 張（新增 duck_gang / seal_gang，移除 usagi_dash / purin_clap）；usagi_dash 改為低機率頁面切換跑馬燈彩蛋，並附上「嗚拉呀哈呀哈嗚拉～」文字。


更新：v5.3.12 Day Buddy Speech Position Fix — 調整每日行程旁小角色點擊後的對話泡泡位置，優先貼齊角色左右側顯示，避免離角色太遠或看起來偏位。


更新：v5.3.13 Usagi Dash Timing Polish — 切頁 usagi_dash 彩蛋由 2.15 秒放慢到約 3.6 秒，延長畫面中段停留感，讓角色與「嗚拉呀哈呀哈嗚拉～」文本可以看清楚；觸發機率與冷卻邏輯不變。

更新：v5.3.13 合併修正版 — Usagi Dash 放慢至約 3.6 秒；每日個別行程旁的小角色對話改為強制單行，較長句會自動縮小字體而不換行。


更新：v5.3.14 Egg Caption Tap + Pending Interaction Fixes
- 累積包含尚未安裝的 v5.3.13：Usagi Dash 放慢至約 3.6 秒、每日個別行程角色文本維持單行。
- 首頁長按彩蛋池移除「旅行正式開始 ♡」，目前保留 5 張。
- 長按彩蛋開啟後，點圖片／場景空白處可更換圖片下方文字；只會換成不同句，若只有一個唯一文本則不變。
- 點沼王／木木梟／百變怪仍只切換角色自己的對話，不會連帶切換底部文字。


更新：v5.3.15 Secret Life Entry Preview
- 首頁 Hero 長按成功後，既有彩蛋卡下方新增「🏠 偷偷看家裡」入口。
- 長按成功當下即以 2 張並行方式背景預載 Secret Life 圖片；App 初次開啟不會預載這批圖片。
- Secret Life 為第二層相簿，不取代既有長按彩蛋池；關閉相簿會回到原本彩蛋。
- 相簿目前放入 4 張預覽圖；可點圖片、左右按鈕或左右滑動切換，並顯示 1 / 4 頁碼。
- 4 張 Secret Life 圖片刻意不加入 Service Worker 的 SHELL 預快取；首次長按後才載入，之後由既有 runtime cache 接手。
- 其餘 v5.3.14 行為維持不變。
