
## v5.3.30 ImportedPlaces Boot Fix
- Fixes a deterministic startup crash introduced in v5.3.26: `normalizeImportedPlaces` was deleted while `createState()` and cloud sync still called it.
- Restores only the quick-import normalizer; does not reintroduce the removed API-key/manual-opening-hours UI.
- Keeps v5.3.29 Chrome/PWA recovery behavior and stable asset cache.
## v5.3.29 Chrome/PWA Recovery
- Fixes Chrome and installed-PWA clients remaining on an older waiting service worker while a fresh browser sees the latest site.
- New service workers activate automatically; existing images remain in the shared asset cache and are not redownloaded just because the shell changes.
- Open Chrome/PWA windows move onto the new shell once after an update.
- Auth gate shows a tiny build number so the loaded version can be verified immediately.
- If a browser-specific private-trip cache cannot boot, the app falls back to the Firebase copy instead of spinning forever.

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

更新：v5.3.16 Secret Life WebP Refresh
- 移除「一起補眠」Secret Life 圖片。
- 新增「沙發搶位大戰」、「木木梟看家先睡著」、「暴暴龍把家裡搞亂」三張。
- Secret Life 相簿由 4 張調整為 6 張；保留原有「想一起去旅行」、「歡迎回來」、「半夜偷吃零食」。
- 6 張 Secret Life 圖片全部改為 WebP，並縮至最大寬 1280px、品質 84，以降低 GitHub / PWA 儲存與傳輸容量。
- Secret Life 圖片仍不放入 Service Worker 的 SHELL 初始預快取；首次首頁長按成功後才背景預載。

更新：v5.3.17 Secret Life Expansion
- Secret Life 相簿新增 5 張：躲貓貓、枕頭大戰、百變怪假裝烏薩奇、堆積木（百變怪變妙蛙種子用藤蔓幫忙）、Olaf 霸床。
- 相簿由 6 張擴充為 11 張；原有 6 張順序與內容維持。
- 新增圖片全部轉為 WebP，最大寬 1280px、品質 80；不將來源 PNG 放入網站。
- 5 張新增 WebP 合計約 400 KB，Secret Life 仍只在首頁 Hero 長按成功後背景預載，並維持 2 張並行預載。
- Service Worker SHELL 仍不預快取 Secret Life 圖片，避免增加 App 初次開啟流量。

更新：v5.3.18 Secret Life Seal Gang
- Secret Life 第 2 張「歡迎回來」移除，改為「討伐海豹幫」。
- 新圖檔使用 `secret-life-seal-gang-mission.webp`，由來源 PNG 縮至 1280×960、WebP 品質 80，約 82 KB。
- Secret Life 總張數維持 11 張，新的海豹幫情境位於第 2 張。
- 舊 `secret-life-welcome-home.webp` 不再被程式引用，可從 GitHub 刪除以節省容量。
- Secret Life 圖片仍只在首頁 Hero 長按成功後背景預載，不加入 Service Worker SHELL。

更新：v5.3.19 Secret Life Hotpot First Scene
- Secret Life 相簿最前面新增 1 張「偷偷煮火鍋開趴」情境圖，位於第 1 張。
- 新圖檔使用 `secret-life-hotpot-party.webp`，由來源 PNG 縮至最大寬 1280px、WebP 品質 80，約 125 KB。
- 原本第 1 張「想一起去旅行」順延為第 2 張，其餘順序整體後移；海豹幫討伐圖維持保留。
- Secret Life 相簿總張數由 11 張增加為 12 張；首頁頁碼初始顯示同步更新為 1 / 12。
- 版本號提升至 v5.3.19，更新 `index.html`、`app.js`、`sw.js`、`manifest.json` 以確保 PWA 取得新相簿內容。
- Secret Life 圖片仍只在首頁 Hero 長按成功後背景預載，不加入 Service Worker SHELL 初始預快取。


更新：v5.3.20 Offline Cache First + Data Saver
- Service Worker 改為靜態資源 Cache First：下載過的 HTML / CSS / JS / 圖片不再於每次開啟時重新向 GitHub Pages 下載。
- 首次安裝新版 SW 時預快取目前 App 實際引用的所有同站靜態資源（約 21 MB，一次性），之後可完整離線讀取 UI 與圖片。
- 同站 runtime cache 亦採 Cache First；未預快取但曾使用過的檔案，第一次下載後會留在 CacheStorage。
- Navigation 改由快取 index.html 優先，版本更新依 app/style/sw query 版本與新版 Service Worker 重新建立 cache。
- Cache 清理只刪除 `kyushu-oct-` 前綴，不再清掉同 origin 其他專案的 cache，避免未來 11 月 PWA 互相影響。
- 移除 Firebase REST 每 4 秒背景輪詢；改為一次性同步。30 分鐘內重開 App 直接使用本機資料，不再重複讀取同一批雲端清單。
- 私人完整 itinerary content 在同一已授權裝置上最多每 6 小時重新抓取一次；期間直接使用已授權 localStorage 快取。
- 使用者編輯 Notes / Shopping / Expense / Booking 狀態等時，線上仍會立即嘗試寫入 Firebase；恢復網路時會強制做一次同步。
- 設定頁的同步狀態可點擊，必要時手動強制同步一次。
- 完全離線時仍使用已授權的私人行程 localStorage 快取；若弱網或 Firebase 暫時失敗，也會退回本機快取，不再卡在登入頁。


更新：v5.3.21 Exchange Rate Calculator
- 在「旅程工具 → 記帳」最上方新增 JPY → TWD 匯率換算卡，輸入日圓時即時在本機換算台幣，不需要每次輸入都發出網路請求。
- 自動匯率使用 ExchangeRate-API Open Access（JPY base），每 24 小時最多自動抓取一次，回應快取於本機；重新打開 App 直接沿用，不重複消耗流量。
- 支援手動匯率，可切換「自動／手動」並保存；離線時仍可使用最後一次自動匯率或手動匯率。
- 旅費總額與每筆記帳同步顯示約略 TWD 金額；原始記帳資料仍以 JPY 為唯一計算基準，不修改既有 expense schema。
- 匯率 API 採 lazy load：只有實際切到「記帳」工具時才檢查是否需要更新，不影響首頁首次載入。
- 更新 PWA cache / asset version 至 v5.3.21 / 5321。


更新：v5.3.22 Place Quick Import
- 旅程工具新增「快速匯入」頁，可貼 Google Maps 地點網址或店名／景點名稱，一行一個。
- 解析完全在瀏覽器本機完成；不需要 Google Places API key，也不會因輸入內容額外呼叫 Google Places API。
- 支援一般 Google Maps `.../maps/place/...`、`?query=` / `?q=` 網址自動推測地點名稱；純文字會建立 Google Maps 搜尋連結。
- `maps.app.goo.gl` 等短網址因瀏覽器無法可靠離線展開，仍會保留原始網址並讓使用者在預覽區直接修改名稱。
- 可批次勾選、修改名稱、指定 D1–D10、預計時間與類型，再加入行程。
- 匯入項目會顯示在指定日期 Timeline 尾端並標示「快速匯入」，Google Maps 按鈕直接使用貼入的原始地圖網址。
- 已匯入項目可在快速匯入頁刪除；資料存於 `${TRIP.id}:importedPlaces`，離線可讀寫。
- 離線變更另以 `importedPlacesPending` 保護，重新連線後先上傳本機版本，再進行 one-shot cloud sync，避免被舊雲端資料覆蓋。
- v5.3.21 匯率換算與 v5.3.20 Cache First / 低流量模式完整保留；本版為累積更新，可直接從 v5.3.20 升級。


更新：v5.3.23 Opening Hours Guard
- 快速匯入地點新增「營業時間衝突檢查」：依行程日期＋預計抵達時間顯示正常、快打烊、尚未營業、公休／已打烊與待確認狀態。
- 每個匯入地點可手動設定週日～週六營業時間；支援 `10:00-18:00`、分段營業、`休`、`24h`，手動資料會隨旅行資料保存，完全離線也能判斷。
- 可選擇在裝置本機設定 Google Maps API Key；Key 只存 trip-namespaced LocalStorage，不同步 Firebase、不寫進 GitHub。
- Google Places 即時檢查採 lazy-load：首頁與一般瀏覽完全不載 Google Maps JS；只有使用者按「檢查」，或行程日期進入未來 7 天內時才自動查詢。
- 行程超過 7 天時，手動按「檢查」使用 Google 一般營業時間；進入 7 天內則優先使用 current opening hours，以納入特殊營業／臨時休業。
- Google 營業資料只存在目前頁面記憶體，不寫入 LocalStorage；只保存 Google 允許長期保存的 Place ID，以避免下一次重新文字搜尋。
- Timeline 與「今日營業檢查」摘要會直接標示衝突；Google 來源資訊旁顯示 `Google Maps` attribution。
- 保留 v5.3.20 Cache First / offline-first、v5.3.21 匯率即時換算、v5.3.22 快速匯入功能。

更新：v5.3.24 Cache Architecture Fix
- 修正 v5.3.20–v5.3.23 的 Navigation Cache First 可能讓 Chrome／已安裝 PWA 長時間停留在舊版的問題。
- CacheStorage 拆成「小型、版本化 App Shell」與「穩定、跨版本共用 Assets」：`kyushu-oct-shell-v5.3.24`、`kyushu-oct-assets-v1`、`kyushu-oct-runtime-v1`。
- HTML / app.js / style.css / manifest 等小型程式檔隨版本更新；大型角色圖、每日插圖、彩蛋與 Secret Life 圖只要 URL/version token 沒變，就跨版本直接沿用本機 cache，不再因每次升版重新下載約 20 MB 素材。
- 從 v5.3.20–v5.3.23 升級時會先把舊 cache 裡已存在的圖片直接搬進新的 stable asset cache，只有真正缺少的檔案才走網路下載。
- v5.3.24 對舊版 cache 做一次性強制接管／重新導頁，專門解除已被舊 index.html 卡住的 Chrome 與 PWA；完成後不再重複強制 reload。
- 未來版本偵測到 waiting Service Worker 時，App 會顯示「新版本已準備完成／立即更新」，使用者按下後才切換新版並 reload。
- 完全離線仍由已快取的最新 App Shell + stable assets 開啟；Firebase、Google Places/Maps、匯率 API 等跨網域請求不由 Service Worker 攔截。
- Cache 清理仍限定 `kyushu-oct-` namespace，不會刪除未來 11 月 PWA 或其他 GitHub Pages repo 的 cache。


更新：v5.3.25 Existing Itinerary Opening Guard
- Opening Hours Guard 不再只檢查「快速匯入」地點，現在會自動辨識 D1–D10 既有行程中有營業時間意義的餐廳、咖啡、景點、商場、店舖、租車、體驗等項目。
- 每日頁面的「今日營業檢查」會同時計入既有行程與快速匯入地點；每個可檢查的既有行程卡也會直接顯示營業狀態與「設定時段 / Google 檢查」操作。
- 既有行程不需要改寫 Firebase 主行程 schema；營業設定以獨立 `openingProfiles` 儲存，包含 Place ID、查詢字串與手動營業時間，並支援 LocalStorage + Firebase 低流量同步。
- 手動營業時間仍可完全離線判斷；Google 即時資料仍只在記憶體中，不永久保存營業內容。
- Google 自動檢查仍維持旅行日前 7 天內、只針對目前查看的日期、同一 session 不重複查詢的省流量策略。
- 交通移動、飯店入住/退房、自由時間、步行/開車等非營業型事件會自動排除；若未來 private trip event 需要強制加入或排除，可使用 `openingCheck: true` / `openingCheck: false`。
- v5.3.24 的三層 CacheStorage 架構完整保留；圖片 assets cache 不因本次升版重新下載。

## v5.3.26 — Simple Opening Hours
- Removed the Google Places API-key setup, manual weekly-hours editor, day-level guard summary, and runtime opening-hours network checks.
- Existing itinerary cards now show only a simple `營業` line when a venue matches the built-in opening-hours catalog.
- Opening hours are bundled with the app, so they work offline and create zero runtime traffic.
- Current catalog entries were refreshed from public/official venue information on 2026-08-31. Unknown/unmatched places simply show no opening-hours row instead of asking the traveler to configure anything.
- Quick-imported places use the same catalog by title; map and delete actions remain unchanged.



## v5.3.28 Auth Hotfix
- No opening-hours or itinerary behavior changes from v5.3.26.
- Existing authorized local private trip cache boots immediately; Firebase refresh is background-only.
- Firebase token/read requests now have finite timeouts instead of leaving the private gate spinning forever.
- UpdateOnly archive is intentionally flat so files replace the GitHub Pages repo root correctly.

## v5.3.31 Linked D3/D9 Itinerary Variants
- Adds a generic linked-variant engine for mutually exclusive multi-day itinerary configurations. One choice can atomically switch multiple days together, preventing invalid mixed combinations.
- Variant selection is stored in trip-namespaced LocalStorage and defaults to undecided; the app never auto-selects an option.
- D3/D9 can show a single shared selector, a compact current-plan badge, two large option cards, and decision-reference notes using the existing decision-card visual language.
- When undecided, linked days do not silently fall back to one itinerary version; detailed events remain hidden until A or B is chosen.
- Schedule rendering, TODAY behavior, event guides, simple opening-hours rows, and the day detail all use only the currently selected variant.
- Exact private itinerary payloads are intentionally NOT embedded in the public GitHub shell. A private JSON variant file can be imported once from Settings; it is stored only in this browser's trip-namespaced LocalStorage.
- D1, D2, D4-D8, and D10 rendering/data are unchanged.

## v5.3.32 Booking Attachments
- Adds PDF/image attachments to every Booking / ticket task. Files are stored as Blob records in IndexedDB (`kyushu-oct-booking-attachments-v1`) and can be opened fully offline.
- Attachment files are device-local only: they are not uploaded to Firebase and are not committed to GitHub. Chrome and a PWA installed from Chrome share the same origin storage; separate browsers do not.
- Supports multiple PDF/image files per booking task, attachment count badges, preview, open-in-new-page, download/save, and deletion.
- Single-file guard is 25 MB. The UI clearly warns that clearing site data removes local attachments.
- Existing Booking completion state, linked D3/D9 variants, simple opening-hours display, exchange rate, Quick Import, and v5.3.24+ low-data/offline cache architecture are otherwise unchanged.


## v5.3.33 D5 Afternoon Options
- Extends the private itinerary-config import format with device-local `dayPatches` and `decisions`.
- D5 can keep one fixed morning/main route while presenting mutually exclusive afternoon branches without exposing private itinerary content in the public repository.
- A branch decision may use `hideUntilSelected: true`, so unselected alternative stops do not clutter the timeline; only the fixed route remains visible until a choice is confirmed.
- D3/D9 linked-variant behavior and v5.3.32 booking PDF/image attachments are unchanged.
- New local keys: `${TRIP.id}:privateDayPatches` and `${TRIP.id}:privateDecisions`.


## v5.3.34 Booking Action Polish

- Polished booking-card action controls only; no itinerary/auth/attachment-storage logic changed.
- `位置` and `附件` now use the same fixed width and height on booking cards.
- Attachment count is rendered as a compact badge, so `附件 1/2/...` no longer changes button size.
- Reduced the visual weight of the paperclip icon and aligned both action labels consistently.


## v5.3.35 — Booking Action Alignment Fix
- 修正 Buddy 主題待處理訂位卡仍保留右側舊 padding，導致「位置 / 附件」在手機上被迫上下換行。
- 修正附件 button 使用 `font: inherit` 蓋掉共用按鈕字級/字重，造成「位置」與「附件」字體看起來不一致。
- 位置與附件現在固定同寬、同高、同字型、同基線，並改用單色 SVG 圖示，避免 Samsung/Chrome emoji 字型差異。
- 不修改 Booking 附件資料、登入、D3/D9、D5 或其他行程邏輯。
