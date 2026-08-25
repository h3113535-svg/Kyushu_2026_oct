Kyushu 2026 Oct — v4.5.0 Buddy Journey

本版重點
- 清除 CSS / JS 中所有 generic 🐰 角色裝飾；Decision 只使用真正烏薩奇圖片。
- D1–D10 每日標題改成「布丁狗＋烏薩奇」雙旅伴；D6 使用指路烏薩奇，Decision 才使用思考烏薩奇，不再重複。
- 新增 8 張輕量 mini WebP，開站即 preload，切換日期立即顯示。
- 訂位／搶票頁重新增加外框與任務卡之間的留白，任務卡間距也加大。
- 訂位頁 Header 改成驚訝布丁狗＋衝刺烏薩奇＋票券。
- 餐飲頁 Header 改為「美食手帳 / 餐飲安排」＋ 3 個功能標籤，不再用長段說明文字。
- 已安排餐廳卡改為日期時間 badge + 餐廳主標 + 狀態 + 詳情 + 地圖。
- 購物、記帳、記事、附近找吃的都同時有布丁狗與烏薩奇身影。
- 點小角色會有輕量 boop + 短台詞；1.8 秒內依序點到兩個角色會觸發雙旅伴小彩蛋。
- Firebase Auth / Database / Rules 不變。

如果目前是 v4.4.0，GitHub 請更新：
index.html / style.css / app.js / sw.js / manifest.json
並新增：
mini-purin-clap.webp
mini-purin-hero.webp
mini-purin-lie.webp
mini-purin-surprise.webp
mini-usagi-point.webp
mini-usagi-excited.webp
mini-usagi-success.webp
mini-usagi-sticker.webp

firebase-config.js 不要覆蓋。
