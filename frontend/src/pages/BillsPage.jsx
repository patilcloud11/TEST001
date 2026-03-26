import React, { useState, useEffect, useCallback } from 'react';
import { billService } from '../services/api';
import { formatCurrency, formatDate } from '../utils/helpers';
import { Card, Badge, Modal, EmptyState, Spinner, Alert } from '../components/ui';
import { Plus, CheckCircle, Trash2, Clock, AlertCircle } from 'lucide-react';

const BILL_TYPES = [
  { value: 'electricity', label: '⚡ Electricity' },
  { value: 'water', label: '💧 Water' },
  { value: 'lpg', label: '🔥 LPG' },
  { value: 'rent', label: '🏠 Rent' },
  { value: 'internet', label: '📡 Internet' },
  { value: 'mobile', label: '📱 Mobile' },
  { value: 'insurance', label: '🛡️ Insurance' },
  { value: 'emi', label: '🏦 EMI / Loan' },
  { value: 'other', label: '📦 Other' },
];

const TYPE_ICONS = {
  electricity: '⚡', water: '💧', lpg: '🔥', rent: '🏠',
  internet: '📡', mobile: '📱', insurance: '🛡️', emi: '🏦', other: '📦',
};

export default function BillsPage() {
  const [bills, setBills] = useState([]);
  const [billSummary, setBillSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState({
    name: '', type: 'electricity', amount: '',
    dueDate: new Date().toISOString().split('T')[0],
    isRecurring: false, recurringDay: '', notes: '',
  });

  const fetchBills = useCallback(async () => {
    setLoading(true);
    try {
      const res = await billService.getAll({ status: statusFilter || undefined });
      setBills(res.data.bills || []);
      setBillSummary(res.data.summary);
    } catch { setError('Failed to load bills'); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchBills(); }, [fetchBills]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await billService.add({ ...form, amount: parseFloat(form.amount) });
      setShowModal(false);
      setForm({ name: '', type: 'electricity', amount: '', dueDate: new Date().toISOString().split('T')[0], isRecurring: false, recurringDay: '', notes: '' });
      fetchBills();
    } catch { setError('Failed to add bill'); }
    finally { setSubmitting(false); }
  };

  const handlePay = async (billId) => {
    try {
      await billService.markPaid(billId);
      setBills(prev => prev.map(b => b.billId === billId ? { ...b, isPaid: true, paidAt: new Date().toISOString() } : b));
    } catch { setError('Failed to mark as paid'); }
  };

  const handleDelete = async (billId) => {
    if (!confirm('Delete this bill?')) return;
    try {
      await billService.delete(billId);
      setBills(prev => prev.filter(b => b.billId !== billId));
    } catch { setError('Failed to delete bill'); }
  };

  const unpaidBills = bills.filter(b => !b.isPaid);
  const paidBills = bills.filter(b => b.isPaid);

  const BillCard = ({ bill }) => (
    <div className={`bg-white/5 backdrop-blur-md border rounded-2xl shadow-lg p-5 flex items-center gap-4 hover:scale-[1.02] transition duration-300 ${
      bill.isOverdue ? 'border-red-500/50 bg-red-500/5' : bill.isDueSoon && !bill.isPaid ? 'border-amber-500/50 bg-amber-500/5' : bill.isPaid ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-white/10'
    }`}>
      <div className="w-11 h-11 rounded-xl bg-slate-700/50 flex items-center justify-center text-xl flex-shrink-0">
        {TYPE_ICONS[bill.type] || '📦'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-slate-200">{bill.name}</p>
          {bill.isRecurring && <Badge variant="info">Recurring</Badge>}
          {bill.isOverdue && <Badge variant="danger">Overdue</Badge>}
          {bill.isDueSoon && !bill.isOverdue && <Badge variant="warning">Due Soon</Badge>}
          {bill.isPaid && <Badge variant="success">Paid</Badge>}
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Clock size={11} /> Due: {formatDate(bill.dueDate)}
          </span>
          {bill.daysUntilDue !== null && !bill.isPaid && (
            <span className={`text-xs font-medium ${bill.isOverdue ? 'text-red-400' : bill.isDueSoon ? 'text-amber-400' : 'text-slate-400'}`}>
              {bill.isOverdue ? `${Math.abs(bill.daysUntilDue)}d overdue` : `${bill.daysUntilDue}d left`}
            </span>
          )}
        </div>
        {bill.notes && <p className="text-xs text-slate-500 mt-0.5 truncate">{bill.notes}</p>}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="text-right">
          <p className="font-bold text-white font-mono">{formatCurrency(bill.amount)}</p>
          {bill.paidAt && <p className="text-xs text-slate-500">Paid {formatDate(bill.paidAt)}</p>}
        </div>
        {!bill.isPaid && (
          <button onClick={() => handlePay(bill.billId)}
            className="bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-xs font-medium transition-all flex items-center gap-1">
            <CheckCircle size={13} /> Pay
          </button>
        )}
        <button onClick={() => handleDelete(bill.billId)}
          className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-400/10 transition-all">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Bills</h1>
          <p className="text-slate-400 text-sm">Manage recurring bills and payments</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-semibold py-2.5 px-5 rounded-xl flex items-center gap-2 shadow-[0_0_20px_rgba(59,130,246,0.2)] hover:shadow-[0_0_30px_rgba(59,130,246,0.3)] hover:scale-[1.05] active:scale-95 transition-all duration-300">
          <Plus size={18} /> Add Bill
        </button>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* Summary */}
      {billSummary && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Unpaid Total', value: formatCurrency(billSummary.totalUnpaid), color: '#f87171', icon: '💳' },
            { label: 'Overdue Bills', value: billSummary.overdueBills, color: '#f87171', icon: '🚨' },
            { label: 'Due Soon', value: billSummary.dueSoonBills, color: '#fbbf24', icon: '⏰' },
          ].map(s => (
            <div key={s.label} className="glass rounded-xl p-4 flex items-center gap-3">
              <div className="text-2xl">{s.icon}</div>
              <div>
                <p className="text-xs text-slate-400">{s.label}</p>
                <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[['', 'All'], ['unpaid', 'Unpaid'], ['paid', 'Paid']].map(([val, label]) => (
          <button key={val} onClick={() => setStatusFilter(val)}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm ${
              statusFilter === val
                ? 'bg-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.4)] border-transparent'
                : 'text-gray-400 hover:text-white bg-white/5 border border-white/10 hover:bg-white/10'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Spinner size={30} /></div>
      ) : bills.length === 0 ? (
        <Card className="py-24 flex flex-col items-center justify-center border-dashed border-2 border-white/10 bg-slate-800/20 backdrop-blur-xl">
          <div className="w-20 h-20 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-full flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(59,130,246,0.3)]">
            <span className="text-4xl">💳</span>
          </div>
          <h3 className="text-xl font-bold text-white mb-3">No bills yet</h3>
          <p className="text-slate-400 max-w-sm text-center mb-8">Add your recurring bills to stay on top of your family's finances with smart alerts and premium tracking.</p>
          <button onClick={() => setShowModal(true)} className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-semibold py-3 px-6 rounded-xl flex items-center gap-2 shadow-[0_0_20px_rgba(59,130,246,0.2)] hover:scale-[1.05] active:scale-95 transition-all duration-300">
            <Plus size={18} /> Add Your First Bill
          </button>
        </Card>
      ) : (
        <div className="space-y-5">
          {unpaidBills.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-300 flex items-center gap-2">
                <AlertCircle size={15} className="text-amber-400" /> Unpaid ({unpaidBills.length})
              </h3>
              {unpaidBills.map(b => <BillCard key={b.billId} bill={b} />)}
            </div>
          )}
          {paidBills.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-300 flex items-center gap-2">
                <CheckCircle size={15} className="text-emerald-400" /> Paid ({paidBills.length})
              </h3>
              {paidBills.map(b => <BillCard key={b.billId} bill={b} />)}
            </div>
          )}
        </div>
      )}

      {/* Add Bill Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add New Bill">
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-300">Bill Name *</label>
            <input type="text" required value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="form-input" placeholder="e.g. Electricity Bill" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">Type</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className="form-input">
                {BILL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">Amount (₹) *</label>
              <input type="number" required min="1" step="0.01" value={form.amount}
                onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                className="form-input" placeholder="1500" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-300">Due Date *</label>
            <input type="date" required value={form.dueDate}
              onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}
              className="form-input" />
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="recurring" checked={form.isRecurring}
              onChange={e => setForm(p => ({ ...p, isRecurring: e.target.checked }))}
              className="rounded border-slate-600 bg-slate-800 text-sky-500" />
            <label htmlFor="recurring" className="text-sm text-slate-300">Recurring bill</label>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-300">Notes</label>
            <input type="text" value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              className="form-input" placeholder="Optional notes" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {submitting ? <><Spinner size={16} /> Adding…</> : 'Add Bill'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
