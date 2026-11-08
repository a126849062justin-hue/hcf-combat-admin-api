# HCF 獨立後台

本機驗收（零安裝）：
  node server.js
  瀏覽器開 http://localhost:8088 ，預設密碼 hcf-change-me

雲端部署見《獨立後台部署與使用手冊.md》。

## 選手頁 CMS

正式後台 https://hcf-admin.onrender.com 登入後選擇 選手頁管理

- 編輯封面標題 說明 封面照片以及各筆訓練與比賽影像
- 可調整分類 排序 顯示狀態 直橫比例與最多三筆精選
- 儲存草稿不會公開 展開預覽可查看照片和播放影片
- 發布後 首頁入口與選手比賽頁會讀取公開內容
- 需回復時 選擇舊版本再按還原選取版本並發布 保留最近八個版本
- 標題不接受標點符號 影像使用官網路徑或公開 HTTPS 檔案網址
- 照片影片需先上傳至官網或公開媒體空間 此編輯器不提供檔案上傳

公開 API `GET /api/public/arena` 不含草稿與歷史版本 快取三十秒
已開啟的官網頁面每分鐘重新讀取一次 後台使用現有登入驗證
`GET /api/admin/arena` 與 `POST /api/admin/arena` 管理完整內容
草稿 發布與還原要求最近讀取的 revision 避免舊分頁覆寫新內容
目前寫入佇列限單一服務程序 請保持單一 Render instance
多 instance 部署前需改用資料庫交易或 compare and swap

資料存在既有 KV store 的 arena_cms key PostgreSQL 不需新增資料表
舊課表 消息 名單 LINE webhook 保持原有格式
備份匯出包含 CMS 草稿 公開版本與歷史 備份匯入會先驗證 CMS 格式
全新安裝先提供 arena-default.json 第一次儲存才寫入資料庫
AI 依使用者決定暫不串接 無 OpenAI 金鑰需求

CMS 發布同步的是瀏覽器顯示內容 靜態 HTML 與無 JavaScript 的 SEO 快照需網站重建
若要同步快照 由公開 API 取出 content 更新官網 arena-app/lib/arena-default.json 後建置部署

驗證 `node --test tests/*.cjs` 測試只使用隔離的臨時資料庫檔案與本機伺服器
不會寫入正式名單 不會發送 LINE 通知
