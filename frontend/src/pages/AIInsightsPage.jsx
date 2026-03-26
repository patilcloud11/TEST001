import React, { useState, useEffect } from 'react';
import { aiService } from '../services/api';
import { formatCurrency, getHealthColor } from '../utils/helpers';
import { Card, Badge, Alert, Spinner, EmptyState } from '../components/ui';
import { Sparkles, TrendingUp, AlertTriangle, Lightbulb, Send, RefreshCw, Target } from 'lucide-react';

const TYPE_CONFIG = {
  warning: { variant: 'danger', icon: <AlertTriangle size={15} />, bg: 'bg-red-500/10 border-red-500/20' },
  info:    { variant: 'info',   icon: <Lightbulb size={15} />,  bg: 'bg-sky-500/10 border-sky-500/20' },
  success: { variant: 'success',icon: <TrendingUp size={15} />, bg: 'bg-emerald-500/10 border-emerald-500/20' },
  tip:     { variant: 'purple', icon: <Sparkles size={15} />,   bg: 'bg-violet-500/10 border-violet-500/20' },
};

export default function AIInsightsPage() {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [budgetRecs, setBudgetRecs] = useState(null);
  const [budgetLoading, setBudgetLoading] = useState(false);

  const fetchInsights = async () => {
    setLoading(true); setError('');
    try {
      const res = await aiService.getInsights();
      setInsights(res.data.insights);
    } catch (err) {
      setError('Failed to generate AI insights. Please check your Groq API key.');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchInsights(); }, []);

  const handleChat = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;
    const q = question;
    setQuestion('');
    setChatHistory(prev => [...prev, { role: 'user', content: q }]);
    setChatLoading(true);
    try {
      const res = await aiService.analyze(q);
      setChatHistory(prev => [...prev, { role: 'ai', content: res.data.answer }]);
    } catch {
      setChatHistory(prev => [...prev, { role: 'ai', content: 'Sorry, I could not process that. Please try again.' }]);
    } finally { setChatLoading(false); }
  };

  const fetchBudgetRecs = async () => {
    setBudgetLoading(true);
    try {
      const res = await aiService.getBudgetRecommendations({ income: 80000, familySize: 4 });
      setBudgetRecs(res.data);
    } catch { setError('Failed to generate budget recommendations'); }
    finally { setBudgetLoading(false); }
  };

  const QUICK_QUESTIONS = [
    'Where am I overspending this month?',
    'How can I save more money?',
    'Should I increase my SIP amount?',
    'What are my biggest expenses?',
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Sparkles size={22} className="text-violet-400" /> AI Financial Insights
          </h1>
          <p className="text-slate-400 text-sm">Powered by Groq AI • Llama 3.3 70B</p>
        </div>
        <button onClick={fetchInsights} disabled={loading} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* Health Score */}
      {loading ? (
        <div className="glass rounded-2xl p-8 flex items-center justify-center">
          <div className="text-center">
            <Spinner size={40} />
            <p className="text-slate-400 mt-4 text-sm">Analyzing your finances with AI...</p>
          </div>
        </div>
      ) : insights ? (
        <>
          {/* Score card */}
          <Card className="flex items-center gap-6 flex-wrap">
            <div className="relative w-28 h-28 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none" stroke="#1e293b" strokeWidth="3" />
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none" stroke={getHealthColor(insights.healthScore)} strokeWidth="3"
                  strokeDasharray={`${insights.healthScore}, 100`}
                  strokeLinecap="round" className="transition-all duration-1000" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-white">{insights.healthScore}</span>
                <span className="text-xs text-slate-400">/ 100</span>
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-xl font-bold text-white">Financial Health</h2>
                <Badge variant={insights.healthScore >= 70 ? 'success' : insights.healthScore >= 50 ? 'warning' : 'danger'}>
                  {insights.healthLabel}
                </Badge>
              </div>
              <p className="text-slate-300 text-sm leading-relaxed">{insights.summary}</p>
            </div>
          </Card>

          {/* Insights grid */}
          {insights.insights?.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-200">Key Insights</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {insights.insights.map((ins, i) => {
                  const cfg = TYPE_CONFIG[ins.type] || TYPE_CONFIG.info;
                  return (
                    <div key={i} className={`rounded-xl p-4 border ${cfg.bg} flex gap-3`}>
                      <div className={`text-${ins.type === 'warning' ? 'red' : ins.type === 'success' ? 'emerald' : ins.type === 'tip' ? 'violet' : 'sky'}-400 flex-shrink-0 mt-0.5`}>
                        {cfg.icon}
                      </div>
                      <div>
                        <p className="font-medium text-slate-200 text-sm">{ins.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{ins.description}</p>
                        {ins.impact && (
                          <Badge variant={ins.impact === 'high' ? 'danger' : ins.impact === 'medium' ? 'warning' : 'default'} className="mt-2">
                            {ins.impact} impact
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {insights.recommendations?.length > 0 && (
            <Card>
              <h3 className="font-semibold text-slate-200 mb-4 flex items-center gap-2">
                <Target size={16} className="text-sky-400" /> Top Recommendations
              </h3>
              <div className="space-y-3">
                {insights.recommendations.map((rec, i) => (
                  <div key={i} className="flex gap-4 p-3 rounded-xl bg-slate-800/50">
                    <div className="w-7 h-7 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {rec.priority}
                    </div>
                    <div>
                      <p className="font-medium text-slate-200 text-sm">{rec.action}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{rec.reason}</p>
                      {rec.estimatedSaving && (
                        <p className="text-xs text-emerald-400 mt-1 font-medium">💰 {rec.estimatedSaving}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Overspending alerts */}
          {insights.overspendingAlerts?.length > 0 && (
            <Card>
              <h3 className="font-semibold text-slate-200 mb-4 flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-400" /> Overspending Detected
              </h3>
              <div className="space-y-3">
                {insights.overspendingAlerts.map((alert, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                    <span className="text-amber-400 font-bold text-sm flex-shrink-0 mt-0.5">{alert.category}</span>
                    <div className="flex-1">
                      <p className="text-sm text-slate-300">
                        Spent {formatCurrency(alert.amount)}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">{alert.suggestion}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Savings tips */}
          {insights.savingsTips?.length > 0 && (
            <Card>
              <h3 className="font-semibold text-slate-200 mb-3 flex items-center gap-2">
                <Lightbulb size={16} className="text-yellow-400" /> Savings Tips
              </h3>
              <div className="grid sm:grid-cols-2 gap-2">
                {insights.savingsTips.map((tip, i) => (
                  <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-slate-800/50">
                    <span className="text-yellow-400 text-sm flex-shrink-0">💡</span>
                    <p className="text-sm text-slate-300">{tip}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <EmptyState icon="🧠" title="Generate AI Insights"
            description="Click Refresh to analyze your finances with AI"
            action={<button onClick={fetchInsights} className="btn-primary text-sm flex items-center gap-2"><Sparkles size={14} /> Generate Insights</button>} />
        </Card>
      )}

      {/* Budget Recommendations */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-200 flex items-center gap-2">
            <Target size={16} className="text-emerald-400" /> AI Budget Plan
          </h3>
          <button onClick={fetchBudgetRecs} disabled={budgetLoading} className="btn-secondary text-xs flex items-center gap-1.5">
            {budgetLoading ? <Spinner size={12} /> : <Sparkles size={12} />} Generate Plan
          </button>
        </div>
        {budgetRecs ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge variant="info">{budgetRecs.strategy}</Badge>
              <p className="text-sm text-slate-400">{budgetRecs.explanation}</p>
            </div>
            <div className="space-y-2">
              {budgetRecs.budgetPlan?.allocations?.map((alloc, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-200">{alloc.category}</p>
                  </div>
                  <span className="text-sm text-slate-400">{alloc.percentage}%</span>
                  <span className="text-sm font-bold text-white font-mono w-28 text-right">
                    {formatCurrency(alloc.recommended)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-emerald-400">💰</span>
              <p className="text-sm text-emerald-300">
                Recommended savings: <strong>{formatCurrency(budgetRecs.budgetPlan?.savings)}</strong> ({budgetRecs.budgetPlan?.savingsPercent}%)
              </p>
            </div>
          </div>
        ) : (
          <p className="text-slate-500 text-sm text-center py-6">
            Click "Generate Plan" to get a personalized budget recommendation
          </p>
        )}
      </Card>

      {/* AI Chat */}
      <Card>
        <h3 className="font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <Sparkles size={16} className="text-violet-400" /> Ask AI About Your Finances
        </h3>

        {/* Quick questions */}
        <div className="flex flex-wrap gap-2 mb-4">
          {QUICK_QUESTIONS.map(q => (
            <button key={q} onClick={() => setQuestion(q)}
              className="text-xs bg-slate-700/50 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-full border border-slate-600 transition-all">
              {q}
            </button>
          ))}
        </div>

        {/* Chat messages */}
        {chatHistory.length > 0 && (
          <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
            {chatHistory.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role === 'ai' && (
                  <div className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0 text-violet-400 text-xs">
                    AI
                  </div>
                )}
                <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${
                  msg.role === 'user'
                    ? 'bg-sky-500/20 text-sky-100 border border-sky-500/20'
                    : 'bg-slate-700/50 text-slate-200'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0 text-violet-400 text-xs">AI</div>
                <div className="bg-slate-700/50 rounded-xl px-4 py-3">
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleChat} className="flex gap-2">
          <input value={question} onChange={e => setQuestion(e.target.value)}
            placeholder="Ask anything about your finances..."
            className="form-input flex-1 text-sm" />
          <button type="submit" disabled={chatLoading || !question.trim()} className="btn-primary flex items-center gap-1.5 px-4">
            <Send size={14} />
          </button>
        </form>
      </Card>
    </div>
  );
}
