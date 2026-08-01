# 部署與上線指南（PostgreSQL + PostGIS + Supabase 版）

本文件說明如何將系統：
1. 建立 Supabase（PostgreSQL + PostGIS）資料庫
2. 匯入官方地籍圖資料（供「地籍圖搜尋」使用）
3. 正式上線（雲端）
4. 在辦公室內部架設（區網 / 不對外開放）

---

## 一、建立 Supabase 專案（PostgreSQL + PostGIS）

1. 前往 https://supabase.com 註冊並登入，點「New Project」建立新專案。
   - Region 建議選 `Northeast Asia (Tokyo)` 或離辦公室最近的節點，延遲較低。
   - 設定資料庫密碼（Database Password），**請妥善保存**，之後連線字串會用到。
2. 專案建立完成後，進入左側選單 **Database → Extensions**，搜尋 `postgis`，點擊啟用（Enable）。
   - 系統程式啟動時也會自動嘗試執行 `CREATE EXTENSION IF NOT EXISTS postgis;`，但建議仍在後台手動確認已啟用，避免專案權限限制導致啟動失敗。
3. 進入 **Project Settings → Database → Connection string**，選擇 **「Session pooler」**（適合本系統這種長駐執行的 Node.js 後端；若之後改用 Vercel/Netlify 等 Serverless 部署後端，才需改用 Transaction pooler）。
   - 複製連線字串，把 `[YOUR-PASSWORD]` 換成步驟 1 設定的資料庫密碼。
   - 貼到 `backend/.env` 的 `DATABASE_URL`。
4. 本機啟動後端（`npm start`）時，程式會自動：
   - 建立 `users`、`points`、`parcels` 三張表與必要索引
   - 建立第一個管理員帳號 `thist`（密碼 `thist000000`，請登入後立即改密碼）

> 若貴單位資安規定不能將資料放上第三方雲端，也可以自架 PostgreSQL + PostGIS（見本文件「辦公室內部架設」章節），程式碼完全相同，只需把 `DATABASE_URL` 換成自架資料庫的連線字串即可。

---

## 二、匯入官方地籍圖資料（地籍圖搜尋 / 套疊圖層用）

「地籍圖搜尋」功能是查詢貴單位匯入 `parcels` 資料表中的宗地資料（段小段、地號、面積、幾何圖形）。地圖上另外套疊的「地籍圖」圖層則是直接串接 **內政部國土測繪中心「國土測繪圖資服務雲」** 的公開 WMTS 圖磚（`LANDSECT` 段籍圖，屬「免申請網路服務」，不需要另外申請帳號即可使用），兩者是互補的：WMTS 圖磚讓使用者「看得到」地籍界線，`parcels` 資料表則讓使用者能「搜尋、定位、取得屬性」。

### 取得地籍圖資料
可透過以下管道取得可匯入的地籍圖圖資（依貴單位業務性質選擇）：
- 內政部地政司「地籍圖資網路便民服務系統」或「全國地政電子謄本系統」申請地籍圖資（洽詢貴單位轄區地政事務所）
- 內政部國土測繪中心「國土測繪圖資服務雲」（https://maps.nlsc.gov.tw）之 WFS / 加值圖資服務（部分需公文申請，機關單位可免費申請）
- 若貴單位已持有既有的地籍 shapefile（.shp）或 GeoJSON 檔案，可直接使用

### 使用 ogr2ogr 匯入 PostGIS（建議方式）

1. 安裝 GDAL（內含 `ogr2ogr` 工具）：
   ```bash
   # Ubuntu / Debian
   sudo apt install gdal-bin
   # macOS (Homebrew)
   brew install gdal
   # Windows：建議安裝 OSGeo4W 或直接用 QGIS 內附的 OSGeo4W Shell
   ```

2. 若原始資料是 TWD97 座標（EPSG:3826）或 TWD67，需先轉換成 WGS84（EPSG:4326）以符合本系統 `parcels.geom` 欄位設定：
   ```bash
   ogr2ogr -f "PostgreSQL" \
     PG:"host=<你的Supabase Host> port=5432 dbname=postgres user=<你的帳號> password=<密碼> sslmode=require" \
     地籍圖.shp \
     -nln parcels_import \
     -s_srs EPSG:3826 -t_srs EPSG:4326 \
     -nlt MULTIPOLYGON \
     -lco GEOMETRY_NAME=geom
   ```
   （`host`、`user` 從 Supabase 的 Connection string 取得；`地籍圖.shp` 換成實際檔名）

3. 匯入到一個暫存表 `parcels_import` 後，用 SQL 把欄位對應到正式的 `parcels` 表（欄位名稱依實際 shapefile 屬性表調整，例如常見的 `SECTION`／`段小段`、`LOTNO`／`地號`）：
   ```sql
   INSERT INTO parcels (county, town, section, lot_no, area_sqm, geom)
   SELECT
     county_col,          -- 換成實際縣市欄位名稱
     town_col,            -- 換成實際鄉鎮欄位名稱
     section_col,         -- 換成實際段小段欄位名稱
     lotno_col,           -- 換成實際地號欄位名稱
     ST_Area(geom::geography),
     ST_Multi(geom)
   FROM parcels_import;

   DROP TABLE parcels_import;
   ```

4. 匯入後可在 Supabase 的 **Table Editor** 或用 SQL 確認筆數與幾何是否正確：
   ```sql
   SELECT count(*), ST_Extent(geom) FROM parcels;
   ```

> 提醒：地籍圖資料量通常較大（全縣市可能數十萬筆宗地），建議依實際需求（例如只匯入貴單位業務相關的鄉鎮、段別）分批匯入，避免一次匯入造成 Supabase 免費方案資料庫容量或效能吃緊。

---

## 三、正式上線（雲端部署）

### 3.1 後端（Node/Express + Socket.io）
可部署到任何支援 Node.js 常駐執行的主機，例如 **Render**、**Railway**、**Fly.io**，或自架 VPS：

1. 將 `backend/` 推送到 Git 倉庫（GitHub/GitLab）
2. 在 Render/Railway 建立新的 Web Service，指向該倉庫的 `backend` 目錄
3. Build command：`npm install`；Start command：`npm start`
4. 設定環境變數（對應 `.env.example`）：
   - `DATABASE_URL`（Supabase 連線字串）
   - `JWT_SECRET`（正式環境請務必換成高強度亂碼，可用 `openssl rand -base64 48` 產生）
   - `ADMIN_EMAIL`
   - `FRONTEND_ORIGIN`（正式前端網域，例如 `https://map.yourdomain.com`）
   - `PORT`（依平台規定，Render/Railway 通常會自動注入）
5. 確認平台有開放 WebSocket（Socket.io 需要），Render/Railway 預設支援

### 3.2 前端（React + Vite）
1. 設定 `frontend/.env`：`VITE_API_URL=https://你的正式後端網域`
2. 執行 `npm run build`，產出 `dist/` 資料夾
3. 將 `dist/` 部署到任一靜態網站主機：**Vercel**、**Netlify**、或自架 Nginx
   - Vercel/Netlify：直接連結 Git 倉庫，Build command 設 `npm run build`，Output directory 設 `dist`
4. 部署完成後，回到後端環境變數，把 `FRONTEND_ORIGIN` 更新為正式前端網址，並重新部署後端（否則 CORS 及 Socket.io 會被擋）

### 3.3 上線前檢查清單
- [ ] `JWT_SECRET` 已換成高強度亂碼
- [ ] 已登入 `thist` 帳號並變更預設密碼
- [ ] 前後端網域皆已啟用 HTTPS（Vercel/Netlify/Render 預設提供；自架 VPS 建議用 Let's Encrypt / Certbot）
- [ ] `server.js` 中 CORS / Socket.io 的來源網址已改成正式網域，不使用 `*`
- [ ] Supabase 已啟用每日自動備份（Project Settings → Database → Backups，免費方案有部分限制，重要資料建議升級付費方案或自行排程 `pg_dump`）
- [ ] 上傳圖片使用的磁碟（`backend/uploads`）有足夠空間，且部署平台的檔案系統為持久化（部分 Serverless/容器平台重啟後檔案會消失，需改用 Supabase Storage 或 S3，如需協助可再告知）

---

## 四、辦公室內部架設（區網 / 不對外開放）

適合「僅供辦公室內部同仁使用、不對外公開」的情境，可完全在內網運作，不一定需要連外網（若地籍圖 WMTS 套疊圖層需要連外網才能顯示，僅需該功能連外，主系統其餘功能可純內網運作）。

### 方案 A：資料庫仍用 Supabase（辦公室內網連外部雲端）
- 優點：不需自行維運資料庫、有雲端自動備份
- 作法：辦公室的伺服器主機（一台一般規格的桌機/伺服器即可）安裝 Node.js，`DATABASE_URL` 直接指向 Supabase，其餘步驟同「內網伺服器架設」

### 方案 B：資料庫也自架在辦公室（完全不連外網）
1. 在辦公室伺服器安裝 PostgreSQL 15+ 與 PostGIS：
   ```bash
   # Ubuntu 範例
   sudo apt install postgresql postgresql-contrib postgis postgresql-15-postgis-3
   sudo -u postgres createdb webgis
   sudo -u postgres psql -d webgis -c "CREATE EXTENSION postgis;"
   sudo -u postgres psql -d webgis -c "CREATE EXTENSION pg_trgm;"
   ```
2. 建立資料庫帳號並設密碼：
   ```sql
   CREATE USER webgis_app WITH PASSWORD '設一個高強度密碼';
   GRANT ALL PRIVILEGES ON DATABASE webgis TO webgis_app;
   ```
3. `backend/.env` 設定：
   ```
   DATABASE_URL=postgresql://webgis_app:密碼@localhost:5432/webgis
   PGSSLMODE=disable
   ```
4. 其餘步驟（Node.js 安裝、pm2、Nginx）同下方共用步驟

### 內網伺服器架設共用步驟

1. **安裝 Node.js 18+**（伺服器主機，建議 Ubuntu Server 或 Windows Server 皆可）：
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
   sudo apt install -y nodejs
   ```

2. **取得程式碼並安裝套件**：
   ```bash
   cd /opt
   # 將本次交付的程式碼上傳/git clone 到此
   cd webgis/backend && npm install
   cd ../frontend && npm install && npm run build
   ```

3. **設定環境變數**（`backend/.env`，依方案 A 或 B 填入 `DATABASE_URL`），另外：
   ```
   FRONTEND_ORIGIN=http://<辦公室伺服器內網IP或主機名稱>
   ```

4. **用 pm2 讓後端常駐執行、開機自動啟動**：
   ```bash
   sudo npm install -g pm2
   cd /opt/webgis/backend
   pm2 start server.js --name webgis-backend
   pm2 save
   pm2 startup   # 依指示執行輸出的指令，設定開機自動啟動
   ```

5. **用 Nginx 同時服務前端靜態檔案並反向代理後端 API / WebSocket**：
   ```nginx
   # /etc/nginx/sites-available/webgis
   server {
     listen 80;
     server_name <辦公室伺服器內網IP或主機名稱>;

     # 前端（Vite build 產出的 dist）
     root /opt/webgis/frontend/dist;
     index index.html;
     location / {
       try_files $uri /index.html;
     }

     # 後端 API
     location /api/ {
       proxy_pass http://127.0.0.1:4000;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
     }

     # 圖片上傳檔案
     location /uploads/ {
       proxy_pass http://127.0.0.1:4000;
     }

     # Socket.io 即時同步（需升級 WebSocket 連線）
     location /socket.io/ {
       proxy_pass http://127.0.0.1:4000;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_set_header Host $host;
     }
   }
   ```
   啟用設定並重啟 Nginx：
   ```bash
   sudo ln -s /etc/nginx/sites-available/webgis /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl restart nginx
   ```
   同時把 `frontend/.env` 的 `VITE_API_URL` 設為空字串或伺服器網址（因為透過 Nginx 同源代理，前端可直接用相對路徑 `/api`，可視實際情況調整 `frontend/src/api.js` 的 `API_URL` 判斷邏輯）。

6. **開放辦公室同仁存取**：
   - 讓同仁瀏覽器輸入 `http://<伺服器內網IP>` 即可使用，不需對外網開防火牆
   - 若需要用主機名稱（如 `http://webgis.office.local`）存取，請在辦公室內部 DNS 或各同仁電腦的 hosts 檔加入對應設定

7. **防火牆**：僅開放 80（Nginx）即可，4000（後端）與 5432（資料庫，若為方案 B）都不需要對外（區網）開放，只保留給 localhost 存取。

8. **備份（方案 B 自架資料庫時）**：
   建議每日排程 `pg_dump` 備份到另一顆硬碟或 NAS：
   ```bash
   # /etc/cron.daily/webgis-backup
   pg_dump -U webgis_app webgis | gzip > /backup/webgis_$(date +%F).sql.gz
   ```

---

## 五、日常維運提醒

- **管理員密碼**：系統預設帳號 `thist` / 密碼 `thist000000`，第一次登入後請立即在「設定與帳號」變更密碼。
- **JWT_SECRET 更換**：正式上線前務必更換成長字串亂碼，且往後不要再變動（變動後所有人需重新登入）。
- **地籍圖資更新**：地籍圖屬於會定期異動（重測、分割合併）的資料，建議每季或每半年重新匯入一次 `parcels` 表，或建立排程腳本自動更新。
- **PostGIS 版本**：Supabase 通常會自動維護 PostGIS 版本；若自架資料庫，升級 PostgreSQL 大版本前請先確認 PostGIS 相容性。
