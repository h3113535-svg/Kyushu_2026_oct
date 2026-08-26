v5.3.0 Travel Guide Layer

核心更新：
1. 行程卡新增安全長按攻略：按住約 0.75 秒，手指移動超過約 10px 或頁面開始滾動就立即取消；達到時間後放開才開啟。
2. Google Maps、按鈕、角色等互動元件不參與長按判定。
3. 第一次使用會用真正的烏薩奇圖示提示「按住行程卡看小攻略」，成功開過一次後永久隱藏。
4. 攻略 Bottom Sheet 使用真正的布丁狗／烏薩奇素材，不使用兔子 Emoji。
5. 每日主題圖也可安全長按，打開「今日總攻略」。
6. 首頁長按改用同樣安全手勢，且改為隨機彩蛋，不再只有一個不明顯動畫。
7. 每個景點攻略包含：私人預設攻略（若 Firebase content/guides 有資料）＋原行程提醒／備案＋我的私人備忘。
8. 攻略「我的備忘」可同步到 Firebase guideNotes，離線時先存本機。
9. 純文字攻略非常輕量，不增加新的大圖資源。

從 v5.2.0 更新 GitHub：
- index.html
- style.css
- app.js
- sw.js
- manifest.json

另外提供 PrivateGuideImport 壓縮包；該包不要上傳 GitHub。
