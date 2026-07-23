# 中山社接龍架構與維護指南

## 目錄

```text
.
├── index.html                 # 網站結構與表單
├── assets/
│   ├── css/
│   │   └── styles.css         # 桌面、手機與元件樣式
│   ├── images/
│   │   └── rotary-international.png # 扶輪社品牌標誌
│   └── js/
│       ├── config.js          # Apps Script 正式網址
│       ├── api.js             # GET/POST、JSONP 與資料指紋
│       ├── model.js           # 共用狀態、排序與資料正規化
│       ├── render.js          # 活動、社員、統計與卡片渲染
│       ├── utils.js           # 日期、跳脫、排序等共用函式
│       └── app.js             # 表單、點擊、背景同步與流程控制
├── apps-script/
│   ├── Code.gs                # Google Sheet 讀寫 API
│   └── appsscript.json        # Apps Script 權限與時區
├── docs/
│   └── ARCHITECTURE.md        # 本文件
└── README.md                  # 安裝與部署說明
```

## 資料流

```text
社員手機
  → index.html / assets
  → api.js
  → Google Apps Script
  → Google Sheet
```

- 開啟網站時，`api.js` 透過 JSONP 取得社員、活動與報名資料。
- `model.js` 整理資料並維護目前選擇的活動。
- `render.js` 只負責把目前狀態畫到頁面。
- `app.js` 接收使用者操作，先做即時畫面回饋，再由 `api.js` 背景寫入。
- 頁面每 15 秒及重新取得焦點時檢查新資料；資料未改變就不重畫。

## 常見修改位置

| 要修改的內容 | 檔案 |
|---|---|
| 文字、欄位、對話框 | `index.html` |
| 顏色、大小、手機排版 | `assets/css/styles.css` |
| Apps Script 網址 | `assets/js/config.js` |
| 點擊、送出、同步流程 | `assets/js/app.js` |
| 活動／社員／統計畫面 | `assets/js/render.js` |
| 資料排序、臨時人員、目前活動 | `assets/js/model.js` |
| Google Sheet 欄位與驗證 | `apps-script/Code.gs` |

## 修改 Google Sheet 資料欄位

如需新增活動或報名欄位，必須一起修改：

1. `apps-script/Code.gs` 的 `EVENT_HEADERS` 或 `RESPONSE_HEADERS`。
2. Apps Script 的讀取、正規化與儲存函式。
3. `assets/js/model.js` 的前端正規化。
4. 需要顯示或編輯時，再修改 `index.html`、`render.js` 或 `app.js`。
5. 在 Apps Script「管理部署作業」選新版本並重新部署。

## 發布前檢查

```bash
node --check assets/js/app.js
node --check assets/js/api.js
node --check assets/js/model.js
node --check assets/js/render.js
node --check assets/js/utils.js
node --check < apps-script/Code.gs
git diff --check
```

確認項目：

- 手機可開啟且不會左右拖移。
- 活動可建立、修改與切換。
- 參加、不克、取消可寫入 Sheet。
- 攜伴、備註與臨時人員可保存。
- 兩個裝置重新整理後資料一致。
- 若變更靜態資源，更新 `index.html` 中的 `?v=` 版本號以避開 LINE 快取。
