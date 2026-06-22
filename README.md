# Allen Invest AI v5.0

Allen股票分析GPT Web v5.0：GitHub + Netlify 專業版。

## 已包含
- 前端網站
- Allen 37項評分模型
- Netlify Functions 後端
- 股票資料 API 端點：`/.netlify/functions/stock?symbol=2330`
- 目前股價顯示
- 回檔買點自動計算
- 建議股數 / 張數
- 預算配置
- Yahoo / CMoney 參考連結

## GitHub 上傳方式
1. 解壓縮此資料夾。
2. 到 GitHub Repository。
3. 點 `uploading an existing file`。
4. 將解壓縮後資料夾內所有檔案拖進去。
5. 按 `Commit changes`。

## Netlify 部署方式
1. 到 Netlify。
2. Add new project / Import from Git。
3. 選這個 GitHub Repository。
4. Build command 留空。
5. Publish directory 填 `.`。
6. Deploy。

## 測試後端
部署完成後，開啟：

`https://你的網站.netlify.app/.netlify/functions/stock?symbol=2330`

如果看到 JSON，代表後端成功。

## 下一步：串接真實市場資料 API
目前 `netlify/functions/stock.js` 使用 MOCK 示範資料。

日後可將 `mockMarket(symbol)` 改成呼叫合法市場資料 API，例如：
- Finnhub
- Twelve Data
- 台灣官方公開資料
- 其他合法授權資料源

API Key 請放在 Netlify Environment variables，不要寫在前端。
