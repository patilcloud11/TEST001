import React from 'react';
import { cn } from '../../utils/helpers';
import { X, AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react';

// ── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, className, ...props }) {
  return (
    <div className={cn('bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl shadow-lg p-5 hover:scale-[1.02] transition duration-300 animate-fade-in', className)} {...props}>
      {children}
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
const BADGE_VARIANTS = {
  default: 'bg-slate-700 text-slate-300',
  success: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
  warning: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
  danger:  'bg-red-500/15 text-red-400 border border-red-500/20',
  info:    'bg-sky-500/15 text-sky-400 border border-sky-500/20',
  purple:  'bg-violet-500/15 text-violet-400 border border-violet-500/20',
};

export function Badge({ children, variant = 'default', className }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full', BADGE_VARIANTS[variant], className)}>
      {children}
    </span>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────
export function Skeleton({ className }) {
  return <div className={cn('shimmer rounded-lg', className)} />;
}

export function CardSkeleton() {
  return (
    <div className="glass rounded-2xl p-5 space-y-3">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, width = 'max-w-lg' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full animate-slide-up', width)}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="font-semibold text-slate-100">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-700">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ── Alert ─────────────────────────────────────────────────────────────────────
const ALERT_VARIANTS = {
  success: { cls: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300', Icon: CheckCircle },
  warning: { cls: 'bg-amber-500/10 border-amber-500/30 text-amber-300', Icon: AlertTriangle },
  error:   { cls: 'bg-red-500/10 border-red-500/30 text-red-300', Icon: XCircle },
  info:    { cls: 'bg-sky-500/10 border-sky-500/30 text-sky-300', Icon: Info },
};

export function Alert({ type = 'info', title, children }) {
  const { cls, Icon } = ALERT_VARIANTS[type] || ALERT_VARIANTS.info;
  return (
    <div className={cn('flex gap-3 p-4 rounded-xl border', cls)}>
      <Icon size={18} className="flex-shrink-0 mt-0.5" />
      <div>
        {title && <p className="font-semibold text-sm mb-0.5">{title}</p>}
        <p className="text-sm opacity-90">{children}</p>
      </div>
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-4xl mb-4">{icon || '📭'}</div>
      <h3 className="font-semibold text-slate-300 mb-1">{title}</h3>
      <p className="text-sm text-slate-500 max-w-xs mb-5">{description}</p>
      {action}
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
export function StatCard({ label, value, sub, icon, color = '#38bdf8', trend, loading }) {
  if (loading) return <CardSkeleton />;
  return (
    <Card className="flex items-start gap-4">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
        style={{ background: `${color}18` }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-400 font-medium mb-0.5">{label}</p>
        <p className="text-xl font-bold text-white truncate">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
        {trend !== undefined && (
          <p className={cn('text-xs mt-1 font-medium', trend >= 0 ? 'text-red-400' : 'text-emerald-400')}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% vs last month
          </p>
        )}
      </div>
    </Card>
  );
}

// ── Progress Bar ──────────────────────────────────────────────────────────────
export function ProgressBar({ value, max, color = '#38bdf8', showLabel = true }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  const barColor = pct >= 100 ? '#f87171' : pct >= 85 ? '#fbbf24' : color;
  return (
    <div className="space-y-1">
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>
      {showLabel && (
        <p className="text-xs text-slate-500">{pct.toFixed(0)}% used</p>
      )}
    </div>
  );
}

// ── Loading Spinner ───────────────────────────────────────────────────────────
export function Spinner({ size = 20 }) {
  return (
    <div
      className="border-2 border-sky-500 border-t-transparent rounded-full animate-spin"
      style={{ width: size, height: size }}
    />
  );
}

// ── Input ─────────────────────────────────────────────────────────────────────
export function Input({ label, error, ...props }) {
  return (
    <div className="space-y-1">
      {label && <label className="block text-sm font-medium text-slate-300">{label}</label>}
      <input className="form-input" {...props} />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ── Select ────────────────────────────────────────────────────────────────────
export function Select({ label, children, error, ...props }) {
  return (
    <div className="space-y-1">
      {label && <label className="block text-sm font-medium text-slate-300">{label}</label>}
      <select className="form-input" {...props}>{children}</select>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
