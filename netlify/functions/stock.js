exports.handler = async (event) => {
  const symbol = (event.queryStringParameters.symbol || "2330").replace(/\D/g, "");
  const budget = Number(event.queryStringParameters.budget || 0);

  try {
    const market = await getTaiwanMarket(symbol);
    return json({ ...market, budget });
  } catch (error) {
    const fallback = mockMarket(symbol);
    return json({
      ...fallback,
      budget,
      mode: "MOCK_FALLBACK",
      source: "示範資料",
      notice: `台股資料源暫時無法取得：${error.message}`
    });
  }
};

async function getTaiwanMarket(symbol) {
  const channels = [
    { prefix: "tse", source: "TWSE MIS 台股資料源" },
    { prefix: "otc", source: "TPEx MIS 上櫃資料源" }
  ];

  for (const ch of channels) {
    const exCh = `${ch.prefix}_${symbol}.tw`;
    const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${exCh}&json=1&delay=0&_=${Date.now()}`;

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Referer": "https://mis.twse.com.tw/stock/fibest.jsp"
        }
      });
      const data = await response.json();
      const item = data?.msgArray?.[0];
      if (!item) continue;

      const price = numberOrNull(item.z) ?? numberOrNull(item.y) ?? numberOrNull(item.o);
      const prevClose = numberOrNull(item.y);
      if (!price || price === 0) continue;

      const changePercent = prevClose
        ? Math.round(((price - prevClose) / prevClose) * 10000) / 100
        : null;

      return {
        symbol,
        name: item.n || stockName(symbol),
        price,
        changePercent,
        volume: parseVolume(item.v),
        pe: null,
        eps: null,
        updateTime: makeUpdateTime(item.d, item.t),
        mode: "LIVE_TW",
        source: ch.source,
        notice: "已取得台股行情；PE/EPS/法人資料可於未來版本擴充"
      };
    } catch (e) {}
  }
  throw new Error(`${symbol} 查無台股行情`);
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === "-" || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
function parseVolume(value) {
  const n = numberOrNull(value);
  return n === null ? null : n;
}
function makeUpdateTime(d, t) {
  if (!d || !t) return new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
  return `${d.slice(0,4)}/${d.slice(4,6)}/${d.slice(6,8)} ${t}`;
}
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
    "2330": "台積電","2317": "鴻海","2377": "微星","6214": "精誠",
    "2881": "富邦金","2303": "聯電","6274": "台燿","3037": "欣興",
    "0050": "元大台灣50","00918": "大華優利高填息30"
  };
  return names[symbol] || "台股個股";
}
function mockMarket(symbol) {
  const profiles = {
    "2330": { name: "台積電", price: 1145, changePercent: 1.2, volume: 32541, pe: 22.5, eps: 50.9 },
    "2317": { name: "鴻海", price: 216, changePercent: 0.8, volume: 58210, pe: 18.2, eps: 11.8 },
    "2377": { name: "微星", price: 188, changePercent: -0.4, volume: 12600, pe: 19.4, eps: 9.7 },
    "6214": { name: "精誠", price: 141, changePercent: 0.5, volume: 4300, pe: 21.3, eps: 6.6 },
    "2881": { name: "富邦金", price: 141, changePercent: 0.2, volume: 22000, pe: 16.1, eps: 8.8 },
    "0050": { name: "元大台灣50", price: 210, changePercent: 0.3, volume: 18000, pe: null, eps: null }
  };
  const data = profiles[symbol] || { name: "台股個股", price: 100, changePercent: 0, volume: 0, pe: null, eps: null };
  return { symbol, ...data, updateTime: new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }) };
}
