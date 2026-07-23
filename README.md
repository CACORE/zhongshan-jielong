# 中山社接龍｜免費公開版

這個版本使用：

- GitHub Pages：公開網站
- Google Sheet：社友、活動與報名資料
- Google Apps Script：網站與 Sheet 之間的讀寫服務

網站程式碼不包含社友名單。社友名稱會在開啟網站時，從私人 Google Sheet 的「工作表1」C 欄讀取。

## 第一次設定 Google Apps Script

1. 開啟社友名單 Google Sheet。
2. 點選「擴充功能」→「Apps Script」。
3. 將 `apps-script/Code.gs` 的內容貼入 Apps Script 的 `Code.gs`。
4. 在 Apps Script 左側「專案設定」開啟顯示 `appsscript.json`，再貼入本專案的 `apps-script/appsscript.json`。
5. 在函式選單選擇 `setup`，按「執行」，依畫面授權。
6. 回到 Sheet，會自動出現「活動資料」與「報名紀錄」兩個分頁。
7. 點右上角「部署」→「新增部署」→ 類型選「網頁應用程式」。
8. 執行身分選「我」，存取權選「任何人」。
9. 部署後複製結尾為 `/exec` 的網址。
10. 把網址貼到根目錄 `config.js` 的引號內。

網站讀取資料使用 Google 官方支援的 JSONP 方式；寫入資料使用不觸發跨網域登入的簡單 POST，因此社友不需要登入 Google。

## 發布 GitHub Pages

1. 在 GitHub 建立公開 repository，例如 `zhongshan-jielong`。
2. 將本資料夾全部檔案推送到 `main` 分支。
3. 到 repository 的 Settings → Pages。
4. Source 選 `Deploy from a branch`。
5. Branch 選 `main`、資料夾選 `/(root)`，按 Save。

稍候 GitHub 會提供公開網址：

`https://你的帳號.github.io/zhongshan-jielong/`

## 資料結構

- `工作表1`：社友名單，網站讀取 C 欄「常用稱呼」。
- `活動資料`：活動設定，由網站建立與修改。
- `報名紀錄`：參加、不克、攜伴與備註。

請勿更改「活動資料」與「報名紀錄」第一列的英文欄位名稱。
