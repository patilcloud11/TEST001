/**
 * Market Controller
 * Fetches gold, silver prices via Alpha Vantage
 * and AI-generated market predictions via Groq
 */
require('dotenv').config();
const axios = require('axios');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const AV_BASE = 'https://www.alphavantage.co/query';
const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY;

// ─── In-memory cache (5 min TTL) ─────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) { cache.delete(key); return null; }
  return entry.data;
}
function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// ─── GET COMMODITY PRICES ─────────────────────────────────────────────────────
const getCommodityPrices = async (req, res) => {
  try {
    const cached = getCached('commodities');
    if (cached) return res.json(cached);

    // Alpha Vantage: XAU/USD and XAG/USD
    const [goldRes, silverRes] = await Promise.all([
      axios.get(AV_BASE, {
        params: { function: 'CURRENCY_EXCHANGE_RATE', from_currency: 'XAU', to_currency: 'USD', apikey: AV_KEY },
        timeout: 8000,
      }),
      axios.get(AV_BASE, {
        params: { function: 'CURRENCY_EXCHANGE_RATE', from_currency: 'XAG', to_currency: 'USD', apikey: AV_KEY },
        timeout: 8000,
      }),
    ]);

    const goldUsd = parseFloat(
      goldRes.data?.['Realtime Currency Exchange Rate']?.['5. Exchange Rate'] || 2300
    );
    const silverUsd = parseFloat(
      silverRes.data?.['Realtime Currency Exchange Rate']?.['5. Exchange Rate'] || 28
    );

    // Convert to INR (approximate)
    const usdInr = 83.5;

    const result = {
      gold: {
        priceUsd: goldUsd,
        priceInr: Math.round(goldUsd * usdInr / 31.1), // per gram (troy oz → grams)
        pricePerTenGrams: Math.round(goldUsd * usdInr / 31.1 * 10),
        symbol: 'XAU',
        unit: '10g',
      },
      silver: {
        priceUsd: silverUsd,
        priceInr: Math.round(silverUsd * usdInr / 31.1),
        symbol: 'XAG',
        unit: '1g',
      },
      usdInr,
      lastUpdated: new Date().toISOString(),
      source: 'Alpha Vantage',
    };

    setCache('commodities', result);
    res.json(result);
  } catch (err) {
    console.error('Commodity price error:', err.message);
    // Return fallback data so UI doesn't break
    res.json({
      gold: { priceUsd: 2300, priceInr: 61800, pricePerTenGrams: 618000, unit: '10g' },
      silver: { priceUsd: 28, priceInr: 75, unit: '1g' },
      usdInr: 83.5,
      lastUpdated: new Date().toISOString(),
      source: 'Fallback Data',
      warning: 'Live data unavailable',
    });
  }
};

// ─── MARKET OVERVIEW ──────────────────────────────────────────────────────────
const getMarketOverview = async (req, res) => {
  try {
    const cached = getCached('market-overview');
    if (cached) return res.json(cached);

    // Nifty 50 ETF as proxy (NIFTYBEES)
    const niftyRes = await axios.get(AV_BASE, {
      params: { function: 'GLOBAL_QUOTE', symbol: 'INFY', apikey: AV_KEY },
      timeout: 8000,
    }).catch(() => ({ data: {} }));

    const quote = niftyRes.data?.['Global Quote'] || {};

    const result = {
      indices: [
        {
          name: 'INFOSYS (Sample)',
          price: parseFloat(quote['05. price'] || 1450),
          change: parseFloat(quote['09. change'] || 12.5),
          changePercent: quote['10. change percent']?.replace('%', '') || '0.86',
        },
      ],
      lastUpdated: new Date().toISOString(),
    };

    setCache('market-overview', result);
    res.json(result);
  } catch (err) {
    console.error('Market overview error:', err.message);
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
};

// ─── AI MARKET PREDICTIONS ────────────────────────────────────────────────────
const getMarketPredictions = async (req, res) => {
  try {
    const { asset } = req.query; // 'gold' | 'silver' | 'market'
    const cacheKey = `prediction-${asset || 'all'}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const prompt = `You are an Indian financial market analyst. Provide a short-term (1-3 month) outlook for ${asset || 'gold, silver, and Indian equity markets'}.

Consider: Global macro trends, USD strength, RBI policy, inflation, geopolitical factors.

Respond ONLY with valid JSON (no markdown):
{
  "predictions": [
    {
      "asset": "Gold|Silver|Nifty 50|Sensex",
      "shortTermOutlook": "Bullish|Bearish|Neutral",
      "priceTarget": "<range or direction>",
      "confidence": <1-100>,
      "keyDrivers": ["driver1", "driver2"],
      "riskFactors": ["risk1", "risk2"],
      "recommendation": "Buy|Sell|Hold|Accumulate on dips",
      "timeHorizon": "1-3 months"
    }
  ],
  "marketSentiment": "Bullish|Bearish|Neutral",
  "summaryForInvestors": "<2-3 sentences practical advice for Indian retail investors>",
  "disclaimer": "This is AI-generated analysis, not financial advice. Please consult a SEBI-registered advisor."
}`;

    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama3-70b-8192',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 1000,
    });

    const rawText = completion.choices[0]?.message?.content || '{}';
    const cleaned = rawText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    setCache(cacheKey, parsed);
    res.json(parsed);
  } catch (err) {
    console.error('Market predictions error:', err);
    res.status(500).json({ error: 'Failed to generate predictions' });
  }
};

module.exports = { getCommodityPrices, getMarketOverview, getMarketPredictions };
