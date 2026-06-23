# Allen Invest AI Final v10.9.1 財報安全版

## 修正
- 解決 v10.9 因外部資料源太多、可能逾時而導致「取得後端資料失敗」。
- 加入全域 try/catch，後端就算發生錯誤也會安全回傳 JSON。
- 財報資料改為安全抓取，抓不到不會讓整個分析失敗。
- 每個外部來源加入 timeout，避免 Netlify Function 卡住。
- 保留 EPS / PE / ROE / 近8期 EPS 判斷架構。

## 建議
若要提升 FinMind 穩定度，請在 Netlify Environment variables 新增：
FINMIND_TOKEN = 你的 FinMind token
