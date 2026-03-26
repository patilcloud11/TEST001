import React, { useState, useEffect, useCallback } from 'react';
import { expenseService, familyService } from '../services/api';
import { formatCurrency, formatCompact, getCategoryConfig, currentYearMonth } from '../utils/helpers';
import { Card, Spinner, Alert, CardSkeleton } from '../components/ui';
import { MonthlyTrendChart, CategoryBarChart, BudgetVsActualChart, SpendingDonutChart } from '../components/charts';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function ReportsPage() {
  const { year: curYear, month: curMonth } = currentYearMonth();
  const [trend, setTrend] = useState([]);
  const [summary, setSummary] = useState(null);
  const [family, setFamily] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(curMonth);
  const [selectedYear, setSelectedYear] = useState(curYear);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [trendRes, sumRes, famRes] = await Promise.all([
        expenseService.getTrend(12),
        expenseService.getSummary(selectedYear, selectedMonth),
        familyService.get(),
      ]);
      setTrend(trendRes.data.trend || []);
      setSummary(sumRes.data);
      setFamily(famRes.data.family);
    } catch { setError('Failed to load reports'); }
    finally { setLoading(false); }
  }, [selectedMonth, selectedYear]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Build budget vs actual data for last 6 months
  const budgetVsActual = trend.slice(-6).map(t => ({
    month: t.month,
    budget: family?.monthlyBudget || 0,
    actual: t.total,
  }));

  if (error) return <Alert type="error">{error}</Alert>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports & Analytics</h1>
          <p className="text-slate-400 text-sm">Deep dive into your family's spending patterns</p>
        </div>
        <div className="flex gap-2">
          <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-sky-500">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-sky-500">
            {[curYear - 1, curYear].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Monthly KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Spent', value: formatCurrency(summary.totalSpent), color: '#f87171' },
            { label: 'Transactions', value: summary.transactionCount, color: '#38bdf8' },
            { label: 'Monthly Budget', value: formatCurrency(summary.monthlyBudget), color: '#818cf8' },
            { label: 'Budget Used', value: `${summary.budgetUsedPercent}%`, color: summary.budgetUsedPercent >= 100 ? '#f87171' : '#34d399' },
          ].map(s => (
            <Card key={s.label} className="text-center">
              <p className="text-xs text-slate-400 mb-1">{s.label}</p>
              <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Charts row 1 */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="h-72">
          <h3 className="font-semibold text-slate-200 mb-4">12-Month Spending Trend</h3>
          {loading ? <div className="shimmer h-48 rounded-lg" /> : <MonthlyTrendChart data={trend} />}
        </Card>
        <Card className="h-72">
          <h3 className="font-semibold text-slate-200 mb-4">Budget vs Actual (6 months)</h3>
          {loading ? <div className="shimmer h-48 rounded-lg" /> : <BudgetVsActualChart budgetData={budgetVsActual} />}
        </Card>
      </div>

      {/* Charts row 2 */}
      {!loading && summary?.categoryBreakdown?.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="h-72">
            <h3 className="font-semibold text-slate-200 mb-4">Spending by Category</h3>
            <SpendingDonutChart data={summary.categoryBreakdown} />
          </Card>
          <Card>
            <h3 className="font-semibold text-slate-200 mb-4">Category Breakdown</h3>
            <div className="space-y-3">
              {summary.categoryBreakdown.map((cat) => {
                const cfg = getCategoryConfig(cat.category);
                const pct = cat.percentage;
                return (
                  <div key={cat.category}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="flex items-center gap-2 text-slate-300">
                        <span>{cfg.icon}</span>{cfg.label}
                      </span>
                      <span className="text-slate-400">
                        {formatCurrency(cat.amount)} <span className="text-slate-600">({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: cfg.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* Category bar chart */}
      {!loading && summary?.categoryBreakdown?.length > 0 && (
        <Card>
          <h3 className="font-semibold text-slate-200 mb-4">Category Amounts</h3>
          <CategoryBarChart data={summary.categoryBreakdown} />
        </Card>
      )}

      {/* Top spending months */}
      {trend.length > 0 && (
        <Card>
          <h3 className="font-semibold text-slate-200 mb-4">Monthly Summary</h3>
          <div className="overflow-x-auto">
            <table className="w-full data-table">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="text-left">Month</th>
                  <th className="text-right">Total Spent</th>
                  <th className="text-right">Budget</th>
                  <th className="text-right">Variance</th>
                </tr>
              </thead>
              <tbody>
                {[...trend].reverse().map((t) => {
                  const budget = family?.monthlyBudget || 0;
                  const variance = budget - t.total;
                  return (
                    <tr key={t.yearMonth}>
                      <td className="font-medium text-slate-200">{t.month}</td>
                      <td className="text-right font-mono text-red-400">{formatCurrency(t.total)}</td>
                      <td className="text-right font-mono text-slate-400">{formatCurrency(budget)}</td>
                      <td className={`text-right font-mono font-semibold ${variance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {variance >= 0 ? '+' : ''}{formatCurrency(variance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
