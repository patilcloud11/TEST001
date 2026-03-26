import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { familyService, expenseService } from '../services/api';
import { formatCurrency, formatCompact, formatDateShort, getCategoryConfig, currentYearMonth } from '../utils/helpers';
import { StatCard, Card, Badge, ProgressBar, Alert, CardSkeleton } from '../components/ui';
import { SpendingDonutChart, MonthlyTrendChart, CategoryBarChart } from '../components/charts';
import { AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState(null);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { year, month } = currentYearMonth();

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [dashRes, trendRes] = await Promise.all([
        familyService.getDashboard(),
        expenseService.getTrend(6),
      ]);
      setDashboard(dashRes.data);
      setTrend(trendRes.data.trend || []);
    } catch {
      setError('Failed to load dashboard. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (error) return <Alert type="error">{error}</Alert>;

  const d = dashboard;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button onClick={fetchData} disabled={loading} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Alerts */}
      {d?.alerts?.length > 0 && (
        <div className="space-y-2">
          {d.alerts.slice(0, 3).map((a, i) => (
            <Alert key={i} type={a.severity === 'error' ? 'error' : 'warning'}>
              {a.message}
            </Alert>
          ))}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          loading={loading}
          label="Monthly Spending"
          value={d ? formatCompact(d.currentMonth?.totalSpent) : '—'}
          sub={`Budget: ${formatCompact(d?.currentMonth?.budget)}`}
          icon="💸"
          color="#f87171"
          trend={d && trend.length >= 2
            ? Math.round(((d.currentMonth.totalSpent - (trend[trend.length - 2]?.total || 0)) /
              (trend[trend.length - 2]?.total || 1)) * 100)
            : undefined}
        />
        <StatCard
          loading={loading}
          label="Budget Remaining"
          value={d ? formatCompact(Math.max(0, d.currentMonth?.remaining)) : '—'}
          sub={`${d?.currentMonth?.usedPercent || 0}% used`}
          icon="💰"
          color="#34d399"
        />
        <StatCard
          loading={loading}
          label="Investments"
          value={d ? formatCompact(d.investments?.totalPrincipal) : '—'}
          sub={`${d?.investments?.count || 0} instruments`}
          icon="📈"
          color="#818cf8"
        />
        <StatCard
          loading={loading}
          label="Unpaid Bills"
          value={d ? formatCurrency(d.bills?.totalUnpaid) : '—'}
          sub={`${d?.bills?.unpaidCount || 0} pending`}
          icon="🧾"
          color="#fbbf24"
        />
      </div>

      {/* Budget progress */}
      {!loading && d && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-200">Monthly Budget</h3>
            <Badge variant={d.currentMonth.usedPercent >= 100 ? 'danger' : d.currentMonth.usedPercent >= 85 ? 'warning' : 'success'}>
              {d.currentMonth.usedPercent}% used
            </Badge>
          </div>
          <ProgressBar value={d.currentMonth.totalSpent} max={d.currentMonth.budget} />
          <div className="flex justify-between text-xs text-slate-500 mt-2">
            <span>Spent: {formatCurrency(d.currentMonth.totalSpent)}</span>
            <span>Budget: {formatCurrency(d.currentMonth.budget)}</span>
          </div>
        </Card>
      )}
      {loading && <CardSkeleton />}

      {/* Charts row */}
      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          {loading ? <CardSkeleton /> : (
            <Card className="h-72">
              <h3 className="font-semibold text-slate-200 mb-4">6-Month Spending Trend</h3>
              <MonthlyTrendChart data={trend} />
            </Card>
          )}
        </div>
        <div className="lg:col-span-2">
          {loading ? <CardSkeleton /> : (
            <Card className="h-72">
              <h3 className="font-semibold text-slate-200 mb-4">Category Breakdown</h3>
              <SpendingDonutChart data={d?.currentMonth?.categoryBreakdown || []} />
            </Card>
          )}
        </div>
      </div>

      {/* Category bar chart */}
      {!loading && d?.currentMonth?.categoryBreakdown?.length > 0 && (
        <Card>
          <h3 className="font-semibold text-slate-200 mb-4">Spending by Category</h3>
          <CategoryBarChart data={d.currentMonth.categoryBreakdown} />
        </Card>
      )}

      {/* Recent Transactions */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-200">Recent Transactions</h3>
          <Link to="/expenses" className="text-sky-400 hover:text-sky-300 text-sm flex items-center gap-1">
            View all <ArrowRight size={13} />
          </Link>
        </div>
        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="shimmer h-12 rounded-lg" />)}
          </div>
        ) : d?.recentTransactions?.length ? (
          <div className="space-y-1">
            {d.recentTransactions.map((t) => {
              const cfg = getCategoryConfig(t.category);
              return (
                <div key={t.expenseId} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/50 transition-colors">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: `${cfg.color}18` }}>
                    {cfg.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{t.description || cfg.label}</p>
                    <p className="text-xs text-slate-500">{formatDateShort(t.date)}</p>
                  </div>
                  <span className="text-sm font-semibold text-red-400">
                    -{formatCurrency(t.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-slate-500 text-sm text-center py-8">No transactions yet this month</p>
        )}
      </Card>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Add Expense', to: '/expenses', icon: '➕', color: '#38bdf8' },
          { label: 'Pay Bill', to: '/bills', icon: '💳', color: '#fbbf24' },
          { label: 'AI Insights', to: '/ai-insights', icon: '🧠', color: '#818cf8' },
          { label: 'View Reports', to: '/reports', icon: '📊', color: '#34d399' },
        ].map((a) => (
          <Link key={a.to} to={a.to}
            className="glass rounded-2xl p-4 text-center hover:border-slate-500 transition-all group"
            style={{ '--hover-color': a.color }}>
            <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">{a.icon}</div>
            <p className="text-xs font-medium text-slate-400 group-hover:text-slate-200">{a.label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
