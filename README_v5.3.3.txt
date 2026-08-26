v5.3.3 Guide Notes Reliability

這版專門修正 Travel Guide Layer 的「我的備忘」可靠性。

更新內容：
1. 輸入備忘時立即存本機；停止輸入約 0.8 秒後背景同步 Firebase。
2. 關閉攻略視窗、按 ESC、點背景或頁面離開前，都會先確保本機保存。
3. Firebase 改成一個攻略一個 guideNotes 子節點 PATCH，不再 PUT 整包，兩台裝置改不同景點時不會互相覆蓋。
4. 每份備忘帶 updatedAt / deviceId / deleted，離線重新連線時會合併雲端與本機，不再直接用雲端整包覆蓋本機。
5. 離線新增/修改會記錄 pending queue；網路恢復後自動重新登入 Firebase session 並補同步。
6. 攻略備忘 key 優先使用 Firebase guides 的固定 ID（例如 d2-parco），景點顯示名稱之後修改也不會讓備忘失聯。舊版 hash key 會在開啟該攻略時自動遷移。
7. 清空備忘採 tombstone 同步，降低舊裝置把已刪內容重新帶回的風險。
8. 狀態明確分成：本機已儲存 / 同步中 / 等待網路同步 / 雲端同步完成。
9. 修正輸入框殘留錯誤範例：「BEAMS 新館 12F」→「BEAMS 新館 2F」。
10. v5.3.2 的 guides 私人攻略資料完全不用重新匯入。

從 v5.3.1 / v5.3.2 程式基底更新 GitHub：
- index.html
- style.css
- app.js
- sw.js
- manifest.json

不需要修改 Firebase guides、Database Rules 或 firebase-config.js。
