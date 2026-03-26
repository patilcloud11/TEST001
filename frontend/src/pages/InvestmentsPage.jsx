import React, { useState, useEffect, useCallback } from 'react';
import { investmentService } from '../services/api';
import { formatCurrency, formatCompact, formatDate, getInvestmentConfig, INVESTMENT_CONFIG } from '../utils/helpers';
import { Card, Badge, Modal, EmptyState, Spinner, Alert, StatCard } from '../components/ui';
import { InvestmentGrowthChart } from '../components/charts';
import { Plus, Trash2, TrendingUp, TrendingDown } from 'lucide-react';

export default function InvestmentsPage() {
  const [data, setData] = useState({ investments: [], portfolio: {} });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '', type: 'sip', principal: '', monthlyAmount: '',
    expectedReturnPct: '12', startDate: new Date().toISOString().split('T')[0],
    maturityDate: '', policyNumber: '', notes: '',
  });

  const fetchInvestments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await investmentService.getAll();
      setData(res.data);
    } catch { setError('Failed to load investments'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchInvestments(); }, [fetchInvestments]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await investmentService.add({
        ...form,
        principal: parseFloat(form.principal),
        monthlyAmount: form.monthlyAmount ? parseFloat(form.monthlyAmount) : null,
        expectedReturnPct: parseFloat(form.expectedReturnPct),
      });
      setShowModal(false);
      setForm({ name: '', type: 'sip', principal: '', monthlyAmount: '', expectedReturnPct: '12', startDate: new Date().toISOString().split('T')[0], maturityDate: '', policyNumber: '', notes: '' });
      fetchInvestments();
    } catch { setError('Failed to add investment'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this investment?')) return;
    try {
      await investmentService.delete(id);
      fetchInvestments();
    } catch { setError('Failed to delete'); }
  };

  const p = data.portfolio;

  const InvestmentCard = ({ inv }) => {
    const cfg = getInvestmentConfig(inv.type);
    const isGain = inv.totalReturns >= 0;
    return (
      <div className="glass rounded-xl p-5 hover:border-slate-600 transition-all group">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
              style={{ background: `${cfg.color}18` }}>
              {cfg.icon}
            </div>
            <div>
              <p className="font-semibold text-slate-200">{inv.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="default">{cfg.label}</Badge>
                {inv.isMatured && <Badge variant="warning">Matured</Badge>}
              </div>
            </div>
          </div>
          <button onClick={() => handleDelete(inv.investmentId)}
            className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-400/10 transition-all">
            <Trash2 size={14} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="bg-slate-800/50 rounded-lg p-3">
            <p className="text-xs text-slate-500 mb-0.5">Invested</p>
            <p className="font-bold text-white font-mono">{formatCompact(inv.principal)}</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <p className="text-xs text-slate-500 mb-0.5">Current Value</p>
            <p className="font-bold text-white font-mono">{formatCompact(inv.currentValue)}</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <p className="text-xs text-slate-500 mb-0.5">Returns</p>
            <p className={`font-bold font-mono flex items-center gap-1 ${isGain ? 'text-emerald-400' : 'text-red-400'}`}>
              {isGain ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {formatCompact(Math.abs(inv.totalReturns))}
            </p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <p className="text-xs text-slate-500 mb-0.5">XIRR</p>
            <p className={`font-bold ${isGain ? 'text-emerald-400' : 'text-red-400'}`}>
              {inv.returnPct >= 0 ? '+' : ''}{inv.returnPct}%
            </p>
          </div>
        </div>

        <div className="flex gap-4 mt-3 text-xs text-slate-500">
          <span>Started: {formatDate(inv.startDate)}</span>
          {inv.maturityDate && <span>Matures: {formatDate(inv.maturityDate)}</span>}
          {inv.monthlyAmount && <span>SIP: {formatCurrency(inv.monthlyAmount)}/mo</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Investments</h1>
          <p className="text-slate-400 text-sm">Track your portfolio growth and returns</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Add Investment
        </button>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* Portfolio Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard loading={loading} label="Total Invested" value={p ? formatCompact(p.totalPrincipal) : '—'} icon="💰" color="#38bdf8" />
        <StatCard loading={loading} label="Current Value" value={p ? formatCompact(p.totalCurrentValue) : '—'} icon="📈" color="#34d399" />
        <StatCard loading={loading} label="Total Returns" value={p ? formatCompact(p.totalReturns) : '—'} icon="✨" color="#818cf8" />
        <StatCard loading={loading} label="Overall Return" value={p ? `${p.overallReturnPct >= 0 ? '+' : ''}${p.overallReturnPct}%` : '—'} icon="🎯" color="#fbbf24" />
      </div>

      {/* Growth Projection Chart */}
      {!loading && data.investments?.length > 0 && (
        <Card className="h-72">
          <h3 className="font-semibold text-slate-200 mb-4">5-Year Growth Projection</h3>
          <InvestmentGrowthChart investments={data.investments} />
        </Card>
      )}

      {/* Investment Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Spinner size={30} /></div>
      ) : data.investments?.length === 0 ? (
        <Card>
          <EmptyState icon="📈" title="No investments yet" description="Start tracking your SIPs, FDs, LIC policies and more"
            action={<button onClick={() => setShowModal(true)} className="btn-primary text-sm">Add Investment</button>} />
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.investments.map(inv => <InvestmentCard key={inv.investmentId} inv={inv} />)}
        </div>
      )}

      {/* Add Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Investment" width="max-w-xl">
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-300">Investment Name *</label>
            <input type="text" required value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="form-input" placeholder="e.g. Mirae Asset Large Cap SIP" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">Type</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className="form-input">
                {Object.entries(INVESTMENT_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">Principal Invested (₹) *</label>
              <input type="number" required min="1" value={form.principal}
                onChange={e => setForm(p => ({ ...p, principal: e.target.value }))}
                className="form-input" placeholder="100000" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">Monthly SIP (₹)</label>
              <input type="number" min="0" value={form.monthlyAmount}
                onChange={e => setForm(p => ({ ...p, monthlyAmount: e.target.value }))}
                className="form-input" placeholder="5000 (optional)" />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">Expected Return % p.a.</label>
              <input type="number" min="1" max="50" step="0.1" value={form.expectedReturnPct}
                onChange={e => setForm(p => ({ ...p, expectedReturnPct: e.target.value }))}
                className="form-input" placeholder="12" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">Start Date</label>
              <input type="date" value={form.startDate}
                onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))}
                className="form-input" />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">Maturity Date</label>
              <input type="date" value={form.maturityDate}
                onChange={e => setForm(p => ({ ...p, maturityDate: e.target.value }))}
                className="form-input" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-300">Policy / Account Number</label>
            <input type="text" value={form.policyNumber}
              onChange={e => setForm(p => ({ ...p, policyNumber: e.target.value }))}
              className="form-input" placeholder="Optional" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {submitting ? <><Spinner size={16} /> Adding…</> : 'Add Investment'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
