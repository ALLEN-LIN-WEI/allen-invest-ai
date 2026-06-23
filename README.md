# Allen Invest AI Final v10.6

## v10.6 修正重點
- 移除錯誤 mock 價格：即時行情失敗時，不再使用示範價做估值與買點。
- 即時 MIS 失敗時，改用 FinMind 最新日K收盤價，並清楚標示「非即時」。
- 均線、量能、法人改成獨立抓取，不再因即時行情失敗而全部顯示待補。
- 60MA、120MA、20日均量、量能倍數：來自 FinMind TaiwanStockPrice。
- 法人20日：來自 FinMind TaiwanStockInstitutionalInvestorsBuySell。
- 若 FinMind 無資料或流量限制，會顯示原因，不會假裝有資料。

## 重要提醒
即時行情仍以券商報價為最終準據；網站若顯示「非即時收盤價」或「舊資料」，請不要用該價格直接下單。
