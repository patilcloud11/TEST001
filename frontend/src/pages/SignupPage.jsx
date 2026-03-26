import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

export default function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', familyName: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setError(''); setLoading(true);
    try {
      await signup(form.name, form.email, form.password, form.familyName);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Signup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-surface-950">
      <div className="w-full max-w-md space-y-7 animate-fade-in">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4">F</div>
          <h2 className="text-2xl font-bold text-white">Create your family account</h2>
          <p className="text-slate-400 text-sm mt-1">Start managing your family finances today</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 text-sm">{error}</div>
        )}

        <div className="glass rounded-2xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-slate-300">Your Name</label>
                <input type="text" required value={form.name} onChange={set('name')} className="form-input" placeholder="Rahul Sharma" />
              </div>
              <div className="space-y-1 col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-slate-300">Family Name</label>
                <input type="text" value={form.familyName} onChange={set('familyName')} className="form-input" placeholder="Sharma Family" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">Email</label>
              <input type="email" required value={form.email} onChange={set('email')} className="form-input" placeholder="you@example.com" />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">Password</label>
              <input type="password" required value={form.password} onChange={set('password')} className="form-input" placeholder="At least 6 characters" />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 mt-2">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Creating account…</> : 'Create Account'}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-500 text-sm">
          Already have an account?{' '}
          <Link to="/login" className="text-sky-400 hover:text-sky-300 font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
