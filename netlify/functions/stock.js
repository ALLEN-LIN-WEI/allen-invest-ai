exports.handler = async (event) => {
  const symbol = (event.queryStringParameters.symbol || "2330").replace(/\D/g, "");
  const budget = Number(event.queryStringParameters.budget || 0);

  try {
    // v5.0 預設：使用 MOCK 模式，方便你先確認 Netlify Function 正常。
    // 未來若要串接真實 API，請在 Netlify Environment variables 加入 API_KEY，
    // 然後把下面的 mockMarket 改成呼叫你的合法市場資料 API。
    const market = mockMarket(symbol);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        ...market,
        budget,
        mode: "MOCK",
        source: "Netlify Function 示範資料",
        notice: "尚未設定真實市場資料 API Key"
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "取得股票資料失敗", detail: error.message })
    };
  }
};

function mockMarket(symbol) {
  const profiles = {
    "2330": { name: "台積電", price: 1145, changePercent: 1.2, volume: 32541, pe: 22.5, eps: 50.9 },
    "2317": { name: "鴻海", price: 216, changePercent: 0.8, volume: 58210, pe: 18.2, eps: 11.8 },
    "2377": { name: "微星", price: 188, changePercent: -0.4, volume: 12600, pe: 19.4, eps: 9.7 },
    "6214": { name: "精誠", price: 141, changePercent: 0.5, volume: 4300, pe: 21.3, eps: 6.6 },
    "2881": { name: "富邦金", price: 141, changePercent: 0.2, volume: 22000, pe: 16.1, eps: 8.8 },
    "0050": { name: "元大台灣50", price: 210, changePercent: 0.3, volume: 18000, pe: null, eps: null }
  };

  const fallback = pseudoMarket(symbol);
  const data = profiles[symbol] || fallback;

  return {
    symbol,
    name: data.name,
    price: data.price,
    changePercent: data.changePercent,
    volume: data.volume,
    pe: data.pe,
    eps: data.eps,
    updateTime: new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })
  };
}

function pseudoMarket(symbol) {
  let seed = 0;
  for (const ch of symbol) seed += ch.charCodeAt(0);
  const price = Math.round((50 + (seed % 300)) * 100) / 100;
  return {
    name: "台股個股",
    price,
    changePercent: Math.round((((seed % 21) - 10) / 10) * 100) / 100,
    volume: 1000 + seed * 13,
    pe: Math.round((12 + (seed % 30)) * 10) / 10,
    eps: Math.round((price / (12 + (seed % 30))) * 10) / 10
  };
}
