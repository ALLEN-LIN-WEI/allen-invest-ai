# Allen Invest AI Final v10.8 資料穩定版

## v10.8 只處理三件事
1. 穩定股價來源
   - TWSE / TPEx MIS
   - Yahoo 備援
   - CMoney 備援
   - FinMind 最新日收盤價
   - 無可靠價格則不使用假價格
   - 加入 60 秒～5 分鐘記憶體快取，降低 Netlify Credits 消耗

2. 穩定 60MA / 120MA 與量能
   - FinMind TaiwanStockPrice
   - 5MA / 10MA / 20MA / 60MA / 120MA
   - 20日均量
   - 量能倍數

3. 穩定法人資料
   - FinMind TaiwanStockInstitutionalInvestorsBuySell
   - 外資5日 / 20日
   - 投信5日 / 20日
   - 自營商5日 / 20日

## 建議設定
為提高 FinMind 穩定度，建議到 Netlify：
Site settings → Environment variables
新增：
FINMIND_TOKEN = 你的 FinMind token

沒有 token 也可用，但較容易遇到流量限制。

## 注意
Yahoo 與 CMoney 備援為非官方 HTML 解析，可能因網站改版失效。
正式下單仍以券商即時報價為準。
