# Web GIS 地圖系統（PostgreSQL + PostGIS + Supabase 版）

React + Leaflet（OpenStreetMap）＋ Node/Express + **PostgreSQL + PostGIS（Supabase）** + Socket.io 即時同步的多人協作地圖系統。

## 這個版本新增／變更了什麼

- 資料庫由 SQLite 改為 **PostgreSQL + PostGIS**，透過 **Supabase** 代管（也可自架，見 `DEPLOY.md`）
- 座標點位（`points`）與地籍宗地（`parcels`）都以 PostGIS 幾何欄位儲存，可做空間查詢
- 新增「**地籍圖**」圖層套疊（內政部國土測繪中心公開 WMTS 圖磚，免申請）
- 新增「**地籍搜尋**」：依段小段／地號模糊搜尋，點選後定位並在地圖上框出該宗地
- 新增「**量測工具**」：可量測地圖上任意路徑的距離，或任意多邊形的面積

## 目錄結構
```
webgis/
├── backend/       # Node/Express API + PostgreSQL(PostGIS) + Socket.io
├── frontend/      # React + Vite + Leaflet
└── DEPLOY.md      # 完整上線 / 辦公室內部架設步驟
```

## 系統需求
Node.js 18 以上、npm、一個 Supabase 專案（或自架 PostgreSQL 15+ / PostGIS 3+）

## 本機開發啟動

### 0. 準備資料庫
先依 `DEPLOY.md` 第一節建立 Supabase 專案並啟用 PostGIS，取得資料庫連線字串（`DATABASE_URL`）。

### 一、啟動後端
```
cd backend
npm install
cp .env.example .env
# 編輯 .env：
#   DATABASE_URL（Supabase 連線字串）
#   JWT_SECRET（隨機長字串）
#   ADMIN_EMAIL（第一個管理員的信箱）
npm start
```
後端會在 http://localhost:4000 啟動，並自動在資料庫中建立 `users`／`points`／`parcels` 三張表，
第一次啟動會自動建立管理員帳號：**帳號 thist ／ 密碼 thist000000**（請登入後盡快變更密碼）。

### 二、啟動前端
(另開一個終端機視窗)
```
cd frontend
npm install
cp .env.example .env
npm run dev
```
瀏覽器開啟 http://localhost:5173 即可使用。

### 三、（選用）匯入地籍圖資料
「地籍搜尋」功能需要先把官方地籍圖資料匯入 `parcels` 表，作法與範例指令請見 `DEPLOY.md` 第二節。
未匯入前，套疊圖層（顯示地籍界線）仍可正常使用，只有「地籍搜尋」查不到結果。

## 使用方式

- **管理員**：帳號 `thist`，密碼 `thist000000`，第一次啟動後端時會自動寫入資料庫，可直接用此帳號登入管理所有點位。
- 登入後，點擊「新增點位」按鈕，輸入 x 座標[必填]、y 座標[必填]、名稱[必填]、描述[選填]、圖片[選填]後點擊「儲存」按鈕。
- 所有在線使用者都會即時看到新增/刪除的座標點（Socket.io 廣播）。
- 一般使用者只能刪除、編輯「自己新增」的點；管理員可管理所有點位。
- 點擊「地籍圖」勾選框可套疊地籍圖層；點擊「地籍搜尋」可依段小段/地號查詢並定位宗地。
- 點擊「距離」或「面積」按鈕後，於地圖上依序點擊即可量測，點擊「✕」清除量測結果。

## 權限機制

- 所有座標資料 API（`/api/points/*`）與地籍資料 API（`/api/parcels/*`）都需要登入（JWT）才能存取。
- 資料庫中的 `points.created_by` 記錄了每個點位的建立者。
- 後端在刪除/編輯時會檢查：`created_by === 目前登入者` 或 `role === 'admin'`，否則回傳「權限不足」並拒絕此更動。

## 多人同步

- PostgreSQL 原生支援大量並行讀寫，Supabase 亦提供連線池（Session/Transaction pooler），可穩定支援數十人同時使用。
- Socket.io 負責即時廣播新增/刪除/修改事件，讓所有人的地圖畫面保持同步，不需要手動重新整理。

## 正式部署與辦公室內部架設

完整步驟（含 Supabase 設定、地籍圖資料匯入、雲端上線、辦公室內網架設、備份、上線檢查清單）請見同目錄下的 **`DEPLOY.md`**。
