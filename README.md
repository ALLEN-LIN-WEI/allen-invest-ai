# Allen Invest AI Ultimate Edition

## 一次完成的終極架構
這版不是單純 UI 改版，而是把 Allen股票分析GPT 的核心架構一次整理完成：

1. 即時股價：Netlify Function 取得台股行情。
2. 基本面：EPS、PE、ROE 欄位已預留，並可用靜態資料庫補值。
3. 籌碼面：法人欄位已預留。
4. 技術面：60MA / 120MA 欄位已預留。
5. 合理價模型：成長股、金融股、ETF 三種模式。
6. Allen 決策引擎：強力分批、分批布局、小量試單、觀察等待、暫避。
7. AI 報告：自動產生投資報告與原因列表。

## 部署方式
解壓縮後，將以下檔案覆蓋到 GitHub repo：

- index.html
- assets/
- netlify/
- netlify.toml
- README.md

Commit 後 Netlify 會自動部署。

## 測試 API
`/.netlify/functions/stock?symbol=2330`

看到 `mode: LIVE_TW` 代表即時台股行情成功。
