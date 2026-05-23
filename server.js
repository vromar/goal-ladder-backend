const express = require('express');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const BYBIT_API_KEY = process.env.BYBIT_API_KEY;
const BYBIT_API_SECRET = process.env.BYBIT_API_SECRET;
const BASE_URL = 'https://api.bybit.com';

function sign(params, timestamp, recvWindow) {
  const queryString = Object.keys(params).map(k => `${k}=${params[k]}`).join('&');
  const signStr = timestamp + BYBIT_API_KEY + recvWindow + queryString;
  return {
    sig: crypto.createHmac('sha256', BYBIT_API_SECRET).update(signStr).digest('hex'),
    queryString,
  };
}

async function bybitGet(path, params = {}) {
  const timestamp = Date.now().toString();
  const recvWindow = '5000';
  const { sig, queryString } = sign(params, timestamp, recvWindow);
  const response = await fetch(`${BASE_URL}${path}?${queryString}`, {
    headers: {
      'X-BAPI-API-KEY': BYBIT_API_KEY,
      'X-BAPI-SIGN': sig,
      'X-BAPI-SIGN-TYPE': '2',
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': recvWindow,
    },
  });
  return response.json();
}

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Get wallet balance
app.get('/api/balance', async (req, res) => {
  try {
    const data = await bybitGet('/v5/account/wallet-balance', { accountType: 'UNIFIED' });
    if (data.retCode !== 0) return res.status(400).json({ error: data.retMsg });

    const account = data.result.list[0];
    const totalEquity = parseFloat(account.totalEquity);

    res.json({
      balance: totalEquity,
      currency: 'USDT',
      coins: account.coin?.map(c => ({
        coin: c.coin,
        equity: parseFloat(c.equity),
        usdValue: parseFloat(c.usdValue),
      })) || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get recent trades
app.get('/api/trades', async (req, res) => {
  try {
    const data = await bybitGet('/v5/execution/list', { category: 'linear', limit: '50' });
    if (data.retCode !== 0) return res.status(400).json({ error: data.retMsg });

    const trades = data.result.list.map(t => ({
      id: t.execId,
      symbol: t.symbol,
      side: t.side,
      qty: parseFloat(t.execQty),
      price: parseFloat(t.execPrice),
      pnl: parseFloat(t.closedPnl || 0),
      time: new Date(parseInt(t.execTime)).toISOString(),
    }));

    res.json({ trades });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Goal Ladder backend running on port ${PORT}`));
