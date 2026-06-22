exports.handler = async (event) => {
  const symbol = (event.queryStringParameters.symbol || "2330").replace(/\D/g, "");
  const budget = Number(event.queryStringParameters.budget || 0);
  const apiKey = process.env.FINNHUB_API_KEY;

  try {
    if (!apiKey) {
      return json({
        ...mockMarket(symbol),
        budget,
        mode: "MOCK",
        source: "示範資料",
        notice: "尚未設定 FINNHUB_API_KEY"
      });
    }

    const finnhubSymbol = `${symbol}.TW`;
    const url = `https://finnhub.io/api/v1/quote?symbol=${finnhubSymbol}&token=${apiKey}`;
    const response = await fetch(url);
    const quote = await response.json();

    if (!quote || !quote.c || quote.c === 0) {
      return json({
        ...mockMarket(symbol),
        budget,
        mode: "MOCK_FALLBACK",
        source: "Finnhub 查無即時資料，改用示範資料",
        notice: `${finnhubSymbol} 無有效報價`
      });
    }

    const changePercent = quote.pc
      ? Math.round(((quote.c - quote.pc) / quote.pc) * 10000) / 100
      : null;

    return json({
      symbol,
      name: stockName(symbol),
      price: quote.c,
      changePercent,
      volume: null,
      pe: null,
      eps: null,
      updateTime: new Date().toLocaleString("zh-TW", {
        timeZone: "Asia/Taipei"
      }),
      budget,
      mode: "LIVE",
      source: "Finnhub Quote API",
      notice: "已取得真實報價；PE/EPS/法人資料待下一階段串接"
    });

  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        error: "取得股票資料失敗",
        detail: error.message
      })
    };
  }
};

function json(data) {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(data)
  };
}

function stockName(symbol) {
  const names = {
    "2330": "台積電",
    "2317": "鴻海",
    "2377": "微星",
    "6214": "精誠",
    "2881": "富邦金",
    "0050": "元大台灣50"
  };
  return names[symbol] || "台股個股";
}

function mockMarket(symbol) {
  const profiles = {
    "2330": { name: "台積電", price: 1145, changePercent: 1.2, volume: 32541, pe: 22.5, eps: 50.9 },
    "2317": { name: "鴻海", price: 216, changePercent: 0.8, volume: 58210, pe: 18.2, eps: 11.8 },
    "2377": { name: "微星", price: 188, changePercent: -0.4, volume: 12600, pe: 19.4, eps: 9.7 },
    "6214": { name: "精誠", price: 141, changePercent: 0.5, volume: 4300, pe: 21.3, eps: 6.6 },
    "2881": { name: "富邦金", price: 141, changePercent: 0.2, volume: 22000, pe: 16.1, eps: 8.8 }
  };

  return {
    symbol,
    ...(profiles[symbol] || {
      name: "台股個股",
      price: 100,
      changePercent: 0,
      volume: 0,
      pe: null,
      eps: null
    }),
    updateTime: new Date().toLocaleString("zh-TW", {
      timeZone: "Asia/Taipei"
    })
  };
}
