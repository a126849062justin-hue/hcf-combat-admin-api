# HCF 後台｜上線部署步驟（Render + Neon，免費）

本資料夾已可直接部署。後台是一支零依賴的 Node 伺服器（`server.js`），
檔案模式即可跑，但 Render 免費版會休眠且不留磁碟，**正式上線請搭 Neon Postgres** 才不會掉資料。

## 一、先建資料庫（Neon，免費）
1. 到 https://neon.tech 註冊 → **Create Project**（區域選 **Singapore** 最近）
2. 複製 **Connection string**（`postgres://…` 開頭整串）備用

## 二、把這個資料夾推上 GitHub
在本資料夾執行（git 已初始化）：
```bash
# 先到 github.com 建一個新的空 repo，例如 hcf-admin-backend（不要勾 README）
git remote add origin https://github.com/<你的帳號>/hcf-admin-backend.git
git branch -M main
git push -u origin main
```

## 三、部署到 Render
**方式 A（推薦・自動套設定）**
1. https://render.com 註冊/登入 → **New → Blueprint**
2. 連到上一步的 GitHub repo → Render 會讀 `render.yaml` 自動建好服務
3. 進該服務 **Environment**，填入：
   - `ADMIN_PASSWORD` ＝ 你的後台密碼（務必自訂）
   - `DATABASE_URL` ＝ 第一步 Neon 的連線字串
4. Deploy 完成會得到網址，例如 `https://hcf-admin.onrender.com`

**方式 B（手動）**：New → Web Service → 連 repo → Build `npm install`、Start `node server.js`、Plan Free，再到 Environment 填上面三個變數。

## 四、與官網對接（重要！）
官網 `hcf-analytics.js` 第 9 行的後端網址必須等於 Render 給的網址。
- 若 Render 網址剛好是 `https://hcf-admin.onrender.com` → 不用改，官網已指向它。
- 若不同 → 把該行改成新網址後重新部署官網。

## 五、驗收
開 Render 給的網址 → 用 `ADMIN_PASSWORD` 登入 → 到官網 `survey.html` 送一筆測試 → 後台「名單」應出現該筆。

## 六、注意
- 免費版閒置 15 分鐘休眠，首次開啟要等 30–60 秒喚醒（介意可升 Render $7/月常駐）。
- 千萬不要用預設密碼 `hcf-change-me` 上線。
