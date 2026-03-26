import React, { useState, useEffect } from 'react';
import { marketService, aiService } from '../services/api';
import { formatCurrency } from '../utils/helpers';
import { Card, Badge, Alert, Spinner } from '../components/ui';
import { Globe, TrendingUp, TrendingDown, RefreshCw, Sparkles } from 'lucide-react';

export default function MarketPage() {
  const [commodities, setCommodities] = useState(null);
  const [predictions, setPredictions] = useState(null);
  const [investmentSuggestions, setInvestmentSuggestions] = useState(null);
  const [loading, setLoading] = useState({ commodities: true, predictions: false, suggestions: false });
  const [error, setError] = useState('');
  const [riskProfile, setRiskProfile] = useState('moderate');

  const fetchCommodities = async () => {
    setLoading(p => ({ ...p, commodities: true }));
    try {
      const res = await marketService.getCommodities();
      setCommodities(res.data);
    } catch { setError('Failed to fetch commodity prices'); }
    finally { setLoading(p => ({ ...p, commodities: false })); }
  };

  const fetchPredictions = async () => {
    setLoading(p => ({ ...p, predictions: true }));
    try {
      const res = await marketService.getPredictions();
      setPredictions(res.data);
    } catch { setError('Failed to generate predictions'); }
    finally { setLoading(p => ({ ...p, predictions: false })); }
  };

  const fetchSuggestions = async () => {
    setLoading(p => ({ ...p, suggestions: true }));
    try {
      const res = await aiService.getInvestmentSuggestions({ riskProfile });
      setInvestmentSuggestions(res.data);
    } catch { setError('Failed to fetch suggestions'); }
    finally { setLoading(p => ({ ...p, suggestions: false })); }
  };

  useEffect(() => { fetchCommodities(); }, []);

  const OutlookBadge = ({ outlook }) => {
    const v = outlook?.toLowerCase() === 'bullish' ? 'success' : outlook?.toLowerCase() === 'bearish' ? 'danger' : 'warning';
    return <Badge variant={v}>{outlook}</Badge>;
  };

  const RISK_COLORS = { Low: '#34d399', Medium: '#fbbf24', High: '#f87171' };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Globe size={22} className="text-sky-400" /> Market & Investments
          </h1>
          <p className="text-slate-400 text-sm">Live commodity prices and AI market predictions</p>
        </div>
        <button onClick={fetchCommodities} disabled={loading.commodities} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw size={14} className={loading.commodities ? 'animate-spin' : ''} /> Refresh Prices
        </button>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* Commodity Prices */}
      <div className="grid sm:grid-cols-2 gap-4">
        {loading.commodities ? (
          <>
            <div className="shimmer h-40 rounded-2xl" />
            <div className="shimmer h-40 rounded-2xl" />
          </>
        ) : commodities && (
          <>
            {/* Gold */}
            <Card className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/15 flex items-center justify-center text-3xl flex-shrink-0">🥇</div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-white">Gold (24K)</h3>
                  <Badge variant="warning">XAU</Badge>
                </div>
                <p className="text-2xl font-bold text-amber-400 font-mono">
                  ₹{commodities.gold.pricePerTenGrams?.toLocaleString('en-IN')}
                </p>
                <p className="text-xs text-slate-400 mt-1">per 10 grams</p>
                <div className="flex gap-3 mt-2 text-xs text-slate-500">
                  <span>1g: ₹{commodities.gold.priceInr?.toLocaleString('en-IN')}</span>
                  <span>${commodities.gold.priceUsd?.toFixed(0)}/troy oz</span>
                </div>
                {commodities.warning && (
                  <p className="text-xs text-amber-500 mt-1">⚠️ {commodities.warning}</p>
                )}
              </div>
            </Card>

            {/* Silver */}
            <Card className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-slate-500/15 flex items-center justify-center text-3xl flex-shrink-0">🥈</div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-white">Silver</h3>
                  <Badge variant="default">XAG</Badge>
                </div>
                <p className="text-2xl font-bold text-slate-300 font-mono">
                  ₹{commodities.silver.priceInr?.toLocaleString('en-IN')}
                </p>
                <p className="text-xs text-slate-400 mt-1">per gram</p>
                <div className="flex gap-3 mt-2 text-xs text-slate-500">
                  <span>${commodities.silver.priceUsd?.toFixed(2)}/troy oz</span>
                  <span>USD/INR: {commodities.usdInr}</span>
                </div>
              </div>
            </Card>
          </>
        )}
      </div>

      {/* Source / timestamp */}
      {commodities && (
        <p className="text-xs text-slate-600 text-right">
          Source: {commodities.source} • Updated: {new Date(commodities.lastUpdated).toLocaleTimeString('en-IN')}
        </p>
      )}

      {/* AI Market Predictions */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-200 flex items-center gap-2">
            <Sparkles size={16} className="text-violet-400" /> AI Market Predictions
          </h3>
          <button onClick={fetchPredictions} disabled={loading.predictions}
            className="btn-secondary text-xs flex items-center gap-1.5">
            {loading.predictions ? <Spinner size={12} /> : <Sparkles size={12} />} Generate
          </button>
        </div>

        {loading.predictions ? (
          <div className="flex items-center justify-center py-10">
            <div className="text-center">
              <Spinner size={30} />
              <p className="text-slate-400 text-sm mt-3">Analyzing market trends with AI...</p>
            </div>
          </div>
        ) : predictions ? (
          <div className="space-y-4">
            {predictions.marketSentiment && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50">
                <span className="text-slate-400 text-sm">Overall Market Sentiment:</span>
                <OutlookBadge outlook={predictions.marketSentiment} />
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              {predictions.predictions?.map((pred, i) => (
                <div key={i} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-slate-200">{pred.asset}</h4>
                    <OutlookBadge outlook={pred.shortTermOutlook} />
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Target:</span>
                      <span className="text-slate-300 font-medium">{pred.priceTarget}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Confidence:</span>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-sky-500 rounded-full" style={{ width: `${pred.confidence}%` }} />
                        </div>
                        <span className="text-slate-400 text-xs">{pred.confidence}%</span>
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Recommendation:</span>
                      <Badge variant={pred.recommendation?.toLowerCase().includes('buy') ? 'success' : pred.recommendation?.toLowerCase().includes('sell') ? 'danger' : 'warning'}>
                        {pred.recommendation}
                      </Badge>
                    </div>
                  </div>
                  {pred.keyDrivers?.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-slate-500 mb-1">Key Drivers:</p>
                      <div className="flex flex-wrap gap-1">
                        {pred.keyDrivers.map((d, j) => (
                          <span key={j} className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">{d}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {predictions.summaryForInvestors && (
              <div className="p-4 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sm text-sky-200">
                💡 {predictions.summaryForInvestors}
              </div>
            )}
            {predictions.disclaimer && (
              <p className="text-xs text-slate-600 italic">{predictions.disclaimer}</p>
            )}
          </div>
        ) : (
          <p className="text-slate-500 text-sm text-center py-8">
            Click "Generate" to get AI-powered market predictions for Gold, Silver, and Indian markets
          </p>
        )}
      </Card>

      {/* AI Investment Suggestions */}
      <Card>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="font-semibold text-slate-200 flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-400" /> Personalized Investment Suggestions
          </h3>
          <div className="flex items-center gap-2">
            <select value={riskProfile} onChange={e => setRiskProfile(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-sky-500">
              <option value="conservative">Conservative</option>
              <option value="moderate">Moderate</option>
              <option value="aggressive">Aggressive</option>
            </select>
            <button onClick={fetchSuggestions} disabled={loading.suggestions}
              className="btn-secondary text-xs flex items-center gap-1.5">
              {loading.suggestions ? <Spinner size={12} /> : <Sparkles size={12} />} Get Suggestions
            </button>
          </div>
        </div>

        {loading.suggestions ? (
          <div className="flex items-center justify-center py-10">
            <Spinner size={30} />
          </div>
        ) : investmentSuggestions ? (
          <div className="space-y-4">
            {investmentSuggestions.portfolioAdvice && (
              <p className="text-sm text-slate-300 p-3 rounded-lg bg-slate-800/50">
                {investmentSuggestions.portfolioAdvice}
              </p>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              {investmentSuggestions.suggestions?.map((sug, i) => (
                <div key={i} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-slate-200">{sug.name}</p>
                      <Badge variant="default" className="mt-1">{sug.type}</Badge>
                    </div>
                    <Badge variant={sug.riskLevel === 'Low' ? 'success' : sug.riskLevel === 'High' ? 'danger' : 'warning'}>
                      {sug.riskLevel} Risk
                    </Badge>
                  </div>
                  <div className="space-y-1.5 text-sm mt-3">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Monthly Amount:</span>
                      <span className="font-medium text-white font-mono">{formatCurrency(sug.recommendedAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Expected Return:</span>
                      <span className="text-emerald-400 font-medium">{sug.expectedReturn}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Horizon:</span>
                      <span className="text-slate-300">{sug.horizon}</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mt-3 leading-relaxed">{sug.why}</p>
                </div>
              ))}
            </div>
            {investmentSuggestions.disclaimer && (
              <p className="text-xs text-slate-600 italic">{investmentSuggestions.disclaimer}</p>
            )}
          </div>
        ) : (
          <p className="text-slate-500 text-sm text-center py-8">
            Select your risk profile and click "Get Suggestions" for personalized investment ideas
          </p>
        )}
      </Card>
    </div>
  );
}
