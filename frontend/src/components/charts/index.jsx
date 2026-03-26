import React from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Area, AreaChart,
  BarChart, Bar,
} from 'recharts';
import { getCategoryConfig, formatCurrency, formatCompact } from '../../utils/helpers';

// ── Custom Tooltip ────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label, formatter }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 shadow-xl">
      {label && <p className="text-xs text-slate-400 mb-1">{label}</p>}
      {payload.map((entry, i) => (
        <p key={i} className="text-sm font-semibold" style={{ color: entry.color || '#38bdf8' }}>
          {entry.name}: {formatter ? formatter(entry.value) : formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
};

// ── Spending Donut Chart ───────────────────────────────────────────────────────
export function SpendingDonutChart({ data }) {
  if (!data?.length) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        No spending data yet
      </div>
    );
  }

  const chartData = data.map((d) => {
    const cfg = getCategoryConfig(d.category);
    return { name: cfg.label, value: d.amount, color: cfg.color, icon: cfg.icon };
  });

  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (percent < 0.06) return null;
    const RADIAN = Math.PI / 180;
    const r = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius="45%"
          outerRadius="70%"
          paddingAngle={2}
          dataKey="value"
          labelLine={false}
          label={renderCustomLabel}
        >
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.color} stroke="transparent" />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(value) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{value}</span>}
          iconSize={10}
          iconType="circle"
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── Monthly Trend Area Chart ──────────────────────────────────────────────────
export function MonthlyTrendChart({ data }) {
  if (!data?.length) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        No trend data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="month"
          tick={{ fill: '#64748b', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatCompact}
          tick={{ fill: '#64748b', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={55}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="total"
          name="Spending"
          stroke="#38bdf8"
          strokeWidth={2}
          fill="url(#spendGrad)"
          dot={{ fill: '#38bdf8', r: 4, strokeWidth: 0 }}
          activeDot={{ r: 6, fill: '#38bdf8' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Category Bar Chart ────────────────────────────────────────────────────────
export function CategoryBarChart({ data }) {
  if (!data?.length) return null;

  const chartData = data.slice(0, 7).map((d) => ({
    name: getCategoryConfig(d.category).label,
    amount: d.amount,
    color: getCategoryConfig(d.category).color,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fill: '#64748b', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatCompact}
          tick={{ fill: '#64748b', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={55}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="amount" name="Amount" radius={[6, 6, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Investment Growth Line Chart ──────────────────────────────────────────────
export function InvestmentGrowthChart({ investments }) {
  if (!investments?.length) return null;

  // Project growth over 5 years
  const years = [0, 1, 2, 3, 4, 5];
  const data = years.map((yr) => {
    const point = { year: yr === 0 ? 'Now' : `+${yr}yr` };
    investments.slice(0, 4).forEach((inv) => {
      const val = inv.principal * Math.pow(1 + inv.expectedReturnPct / 100, yr);
      point[inv.name.slice(0, 12)] = Math.round(val);
    });
    return point;
  });

  const COLORS = ['#38bdf8', '#818cf8', '#34d399', '#fbbf24'];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="year" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={formatCompact} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
        <Tooltip content={<CustomTooltip />} />
        <Legend formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 11 }}>{v}</span>} />
        {investments.slice(0, 4).map((inv, i) => (
          <Line
            key={inv.investmentId}
            type="monotone"
            dataKey={inv.name.slice(0, 12)}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Budget vs Actual Bar Chart ────────────────────────────────────────────────
export function BudgetVsActualChart({ budgetData }) {
  if (!budgetData?.length) return null;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={budgetData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={formatCompact} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={55} />
        <Tooltip content={<CustomTooltip />} />
        <Legend formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{v}</span>} />
        <Bar dataKey="budget" name="Budget" fill="#334155" radius={[4, 4, 0, 0]} />
        <Bar dataKey="actual" name="Actual" fill="#38bdf8" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
