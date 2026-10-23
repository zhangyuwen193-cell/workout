# 啟用跨裝置同步（不需任何 Codex 插件）

程式已預備 Firebase Authentication + Cloud Firestore，但尚未連上實際雲端專案。`firebase-config.js` 為 null 時，保留原有本機功能；填入有效設定後，需登入才可編輯與同步。GitHub Pages 仍是網站主機。

## 只需設定一次

1. 開啟 [Firebase 控制台](https://console.firebase.google.com/)，以自己的 Google 帳號建立專案。此步驟需由專案擁有者操作與接受適用條款，不必提供 Google 密碼給其他人。
2. 在專案新增「網頁應用程式」，複製其 `firebaseConfig` 公開設定物件（apiKey、authDomain、projectId、appId 等）。將 `firebase-config.js` 的 `null` 換成該物件。請勿提供服務帳號 JSON、管理員私鑰或帳號密碼。
3. Authentication → Sign-in method 啟用 Email/Password。在 Users 分別新增兩個 Email／密碼帳號，密碼由兩人自己保管。此網站不提供任意註冊使用者。
4. 在 Authentication 的 Settings → Authorized domains 加入 `zhangyuwen193-cell.github.io`，本機測試可加入 `localhost`。
5. 建立 **Cloud Firestore Standard / Native mode** 資料庫，選擇適合自己的地區，使用正式安全規則。不要啟用允許任何人讀寫的測試模式。
6. 將本專案 `firestore.rules` 完整貼到 Firestore → Rules 並發佈。
7. 複製 Authentication → Users 中每位使用者的 UID。在 Firestore 建立集合 `members`，文件 ID 為該 UID，唯一欄位 `profileId`（string）填入：

   | 姓名 | profileId |
   | --- | --- |
   | 張語宸 | yuchen |
   | 張祐綸 | youlun |

   這兩份文件必須由專案擁有者透過控制台設定。前端不能自行寫入 members，因此無法只改網頁上的姓名就冒用另一人。

8. 將填好的 `firebase-config.js` 推送到 GitHub，等待 Pages 更新。

## 第一次啟用

- 先在有舊紀錄的手機替兩人各自匯出 JSON 備份。
- 各自登入自己的帳號。雲端尚無資料時，會上傳當前使用者的本機紀錄；已有雲端資料時，會讀取雲端版本，不自動以空白裝置覆蓋。
- 第一次登入前的本機內容會另存一份，可點「匯出同步前備份」。若其他裝置還有獨有紀錄，請先匯出檢查，再以原有匯入功能明確選擇要替換的內容。
- 每次修改先儲存在本機與待上傳佇列，約 0.8 秒後上傳；另一台已登入的裝置會接收即時更新。
- 網路失敗時會顯示尚未同步，恢復連線、切回頁面或按「重試同步」可再試。首次登入與取得雲端資料需連線。
- 若兩台裝置修改同一份資料，修訂版檢查會阻擋舊版本覆蓋；先匯出兩邊備份，再明確選「使用雲端版本」或「以上方本機版本取代雲端」。目前是整份個人資料衝突檢查，沒有逐組自動合併。
- 同一瀏覽器仍可能保有兩人的本機快取；請勿在公用裝置存放私人紀錄。

## 驗收

1. 手機 A 登入張語宸，新增一筆動作，等待「已與雲端同步」。
2. 電腦 B 登入同一帳號，確認動作、日期、每組資料及課表一致；在 B 修改後確認 A 更新。
3. 登入張祐綸，確認不會讀取或修改張語宸的雲端文件。登入一人後選另一姓名會鎖定編輯。
4. 暫時斷網後修改、重新連線，確認待上傳內容送出。
5. 兩台同時修改，確認會提示衝突，不會直接覆蓋。
6. 在 Firebase Rules Playground 驗證：未登入不能讀寫 profiles；本人能存取自己的 profile；另一人及任何前端 members 寫入均遭拒。

目前沒有實際 Firebase 專案設定，以上跨裝置與規則部署驗收尚未執行。單份資料以一個 Firestore 文件儲存，達約 790 KB 時會停止上傳並保留本機資料；若累積大量紀錄，可改成按日期拆分文件。

實作依據：[Firebase CDN 安裝](https://firebase.google.com/docs/web/alt-setup)、[密碼登入](https://firebase.google.com/docs/auth/web/password-auth)、[即時監聽](https://firebase.google.com/docs/firestore/query-data/listen)、[交易](https://firebase.google.com/docs/firestore/manage-data/transactions)。
