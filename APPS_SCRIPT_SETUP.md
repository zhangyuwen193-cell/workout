# Google 試算表自動同步（免同步碼）

目前網站已設定 Apps Script 部署網址。新版取消同步碼，開啟網站或切換「張語宸／張祐綸」會自動連接並同步。任何知道網站或 API 網址的人都可以讀寫兩人的資料，沒有登入驗證。

## 已有部署：更新一次即可

1. 開啟原 Apps Script 專案，將本專案 [apps-script/Code.gs](apps-script/Code.gs) 完整取代原 Code.gs 並儲存。
2. 點「部署 → 管理部署作業」，選目前網站正在使用的部署。
3. 按鉛筆編輯，版本選「新版本」，再按「部署」。請沿用原部署網址。
4. 重新整理健身APP，即可自動連線，不需輸入同步碼。

只儲存程式不會更新正式部署。若網站顯示「Apps Script 仍是舊版」，代表還需要上面的新版本部署。舊版 TOKEN_YUCHEN／TOKEN_YOULUN 屬性不再使用，可保留；SPREADSHEET_ID、STATE_yuchen、STATE_youlun 與既有試算表資料請保留，以延續紀錄。

## 新建部署

1. 建立專用試算表，開啟「擴充功能 → Apps Script」。試算表不需公開分享。
2. 貼上 Code.gs，儲存，執行一次 setup 並由擁有者完成授權。
3.「部署 → 新增部署作業 → 網頁應用程式」，執行身分選「我」，存取權選「所有人 / Anyone」。
4. 將結尾 /exec 的網址填入 apps-script-config.js 並推送 GitHub。

如組織禁止 Anyone 部署，請使用管理員允許的服務，不要繞過組織限制。

## 同步規則

- 編輯先存本機，約 1 秒後上傳；頁面可見時每 30 秒檢查其他裝置更新，恢復網路或切回頁面也會重試。
- 每人紀錄與課表各自分開，但沒有身分驗證，任何人都能選擇兩個姓名。
- 遠端無紀錄時上傳本機資料；已有資料時讀取遠端版本。同步前本機紀錄會另外保留，可點「匯出同步前備份」。
- 尚未讀取遠端紀錄時鎖定編輯，避免以空白裝置覆蓋歷史。連線成功後斷網仍可編輯，保留待上傳佇列。
- 版本衝突會先停止上傳，請分別備份後明確選擇試算表或本機版本，不會直接覆蓋。
- 試算表的兩人訓練明細與課表頁僅供檢視；請在網站編輯，直接修改這些頁不會回寫網站。
- 健身APP_同步資料是保留歷次版本的 JSON 快照，不要直接更動。單份資料上限約 790,000 字元，長期需留意試算表總容量。

## 驗證

部署後開啟 /exec 應回應 version: 2 與 publicSync: true。再在手機 A 新增紀錄，確認顯示已同步；電腦 B 選相同姓名，確認更新，並測試切換姓名、課表、離線重試與衝突。

網站只在收到伺服器的版本確認後顯示同步成功，使用 text/plain POST 與可確認的 JSON 回應，不使用 no-cors。若連線失敗，請檢查 Anyone 權限與新版本部署。

官方文件：[網頁應用程式](https://developers.google.com/apps-script/guides/web)、[Content Service](https://developers.google.com/apps-script/guides/content)、[LockService](https://developers.google.com/apps-script/reference/lock/lock-service)。
