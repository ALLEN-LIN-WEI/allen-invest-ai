# Allen Invest AI v7.0 最終整合版

## 功能
- 台股行情資料源：Netlify Function 後端
- 成功時顯示 `mode: LIVE_TW`
- Allen 37項評分卡
- 100分制評分
- 第一 / 第二 / 第三買點
- 建議零股、整張或等待
- 預算配置
- 自選股
- Yahoo / CMoney 參考連結

## 部署
1. 解壓縮。
2. 到 GitHub Repository。
3. 上傳所有檔案與資料夾。
4. Commit changes。
5. Netlify 會自動重新部署。

## 測試
部署後打開：

`/.netlify/functions/stock?symbol=2330`

看到 `mode: LIVE_TW` 代表台股資料源成功。
