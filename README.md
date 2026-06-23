# Allen Invest AI Final v10.9 財報資料版

## v10.9 修正重點
- 修正只有少數股票有 EPS / ROE / PE 的問題。
- 新增 FinMind 財報資料模組：
  - TaiwanStockPER：嘗試取得 PE
  - TaiwanStockFinancialStatements：嘗試取得 EPS、ROE
- EPS 成長性與 EPS 穩定性改用近8期 EPS 嘗試判斷。
- 若 FinMind 抓不到，才使用少數常用股票備用資料。
- 若仍沒有資料，才顯示「C｜待補」。

## 建議設定
到 Netlify：
Site settings → Environment variables
新增：
FINMIND_TOKEN = 你的 FinMind token

沒有 token 也可用，但較容易遇到流量限制。

## 注意
不同股票的財報欄位名稱可能不完全一致，v10.9 已加入多種欄位名稱判斷，但仍可能有部分股票顯示待補。
