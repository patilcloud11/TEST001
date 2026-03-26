import React, { useState, useEffect, useCallback } from 'react';
import { expenseService } from '../services/api';
import { formatCurrency, formatDate, getCategoryConfig, CATEGORY_CONFIG, currentYearMonth } from '../utils/helpers';
import { Card, Badge, Modal, EmptyState, Spinner, Alert } from '../components/ui';
import { Plus, Trash2, Filter, Search } from 'lucide-react';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function ExpensesPage() {
  const { year: curYear, month: curMonth } = currentYearMonth();
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState(curMonth);
  const [filterYear, setFilterYear] = useState(curYear);
  const [filterCat, setFilterCat] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    amount: '', category: 'grocery', description: '',
    date: new Date().toISOString().split('T')[0], tags: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [expRes, sumRes] = await Promise.all([
        expenseService.getAll({ month: filterMonth, year: filterYear, category: filterCat || undefined, limit: 100 }),
        expenseService.getSummary(filterYear, filterMonth),
      ]);
      setExpenses(expRes.data.expenses || []);
      setSummary(sumRes.data);
    } catch { setError('Failed to load expenses'); }
    finally { setLoading(false); }
  }, [filterMonth, filterYear, filterCat]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.amount || parseFloat(form.amount) <= 0) return;
    setSubmitting(true);
    try {
      await expenseService.add({
        ...form,
        amount: parseFloat(form.amount),
        tags: form.tags ? form.tags.split(',').map(t => t.trim()) : [],
      });
      setShowModal(false);
      setForm({ amount: '', category: 'grocery', description: '', date: new Date().toISOString().split('T')[0], tags: '' });
      fetchData();
    } catch { setError('Failed to add expense'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this expense?')) return;
    try {
      await expenseService.delete(id);
      setExpenses(prev => prev.filter(e => e.expenseId !== id));
    } catch { setError('Failed to delete'); }
  };

  const filtered = expenses.filter(e =>
    !search || e.description?.toLowerCase().includes(search.toLowerCase()) ||
    getCategoryConfig(e.category).label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Expenses</h1>
          <p className="text-slate-400 text-sm">Track and manage your family spending</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Add Expense
        </button>
      </div>

      {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-slate-400" />
            <span className="text-sm text-slate-400">Filter:</span>
          </div>
          <select value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-sky-500">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-sky-500">
            {[curYear - 1, curYear].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-sky-500">
            <option value="">All Categories</option>
            {Object.entries(CATEGORY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <div className="flex-1 min-w-40 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search..." className="w-full bg-slate-800 border border-slate-600 rounded-lg pl-9 pr-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-sky-500" />
          </div>
        </div>
      </Card>

      {/* Summary row */}
      {summary && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total Spent', value: formatCurrency(summary.totalSpent), color: '#f87171' },
            { label: 'Transactions', value: summary.transactionCount, color: '#38bdf8' },
            { label: 'Budget Left', value: formatCurrency(Math.max(0, summary.budgetRemaining)), color: '#34d399' },
          ].map(s => (
            <div key={s.label} className="glass rounded-xl p-4 text-center">
              <p className="text-xs text-slate-400 mb-1">{s.label}</p>
              <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Expense list */}
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Spinner size={30} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon="🧾" title="No expenses found"
            description="Add your first expense or change filters"
            action={<button onClick={() => setShowModal(true)} className="btn-primary text-sm">Add Expense</button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full data-table">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="text-left">Category</th>
                  <th className="text-left">Description</th>
                  <th className="text-left">Date</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((exp) => {
                  const cfg = getCategoryConfig(exp.category);
                  return (
                    <tr key={exp.expenseId} className="group transition-colors">
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{cfg.icon}</span>
                          <Badge variant="default">{cfg.label}</Badge>
                        </div>
                      </td>
                      <td className="max-w-48">
                        <p className="truncate text-slate-200">{exp.description || '—'}</p>
                      </td>
                      <td className="text-slate-400 text-xs">{formatDate(exp.date)}</td>
                      <td className="text-right font-mono font-semibold text-red-400">
                        -{formatCurrency(exp.amount)}
                      </td>
                      <td className="text-right">
                        <button onClick={() => handleDelete(exp.expenseId)}
                          className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-400/10 transition-all">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-slate-400 border-t border-slate-700">
                    {filtered.length} transactions
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-red-400 border-t border-slate-700 font-mono">
                    -{formatCurrency(filtered.reduce((s, e) => s + e.amount, 0))}
                  </td>
                  <td className="border-t border-slate-700" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {/* Add Expense Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add New Expense">
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">Amount (₹) *</label>
              <input type="number" required min="1" step="0.01" value={form.amount}
                onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                className="form-input" placeholder="500" />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">Date</label>
              <input type="date" value={form.date}
                onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                className="form-input" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-300">Category *</label>
            <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="form-input">
              {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.icon} {v.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-300">Description</label>
            <input type="text" value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="form-input" placeholder="e.g. Big Basket order" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-300">Tags (comma separated)</label>
            <input type="text" value={form.tags}
              onChange={e => setForm(p => ({ ...p, tags: e.target.value }))}
              className="form-input" placeholder="e.g. monthly, essentials" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {submitting ? <><Spinner size={16} /> Adding…</> : 'Add Expense'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
