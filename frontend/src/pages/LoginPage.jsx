import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Loader2, Mail, Lock } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: 'demo@familyfinance.in', password: 'password123' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(form.email, form.password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Splash Screen Animation */}
      {showSplash && (
        <div className="fixed inset-0 z-[100] bg-[#020617] flex flex-col items-center justify-center transition-opacity duration-500">
          <div className="flex flex-col items-center animate-pulse">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-5xl shadow-[0_0_50px_rgba(59,130,246,0.5)] mb-8">F</div>
            <h1 className="text-2xl font-bold text-white tracking-[0.3em] uppercase opacity-90">FamilyFinance</h1>
            <div className="mt-8 w-48 h-1 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 animate-progress origin-left"></div>
            </div>
          </div>
        </div>
      )}

    <div 
      className={`min-h-screen flex items-center justify-end bg-cover bg-center relative overflow-hidden transition-all duration-1000 ${showSplash ? 'opacity-0 scale-110' : 'opacity-100 scale-100'}`}
      style={{ backgroundImage: 'url("https://live.staticflickr.com/65535/55166484000_d42e36711a_b.jpg")' }}
    >
      <div className="absolute inset-0 bg-black/30" />

      {/* Top Left Logo */}
      <div className="absolute top-8 left-8 z-20 flex items-center gap-3 animate-fade-in">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center text-white font-bold shadow-lg">F</div>
        <span className="font-bold text-xl text-white tracking-tight">FamilyFinance</span>
      </div>
      
      {/* Right Aligned Login Side Panel (0 margin, full height) */}
      <div className="relative z-10 w-full max-w-md h-screen p-8 lg:p-12 bg-black/20 backdrop-blur-3xl border-l border-white/10 shadow-2xl animate-slide-in-right flex flex-col justify-center">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-white leading-tight">
            Smart money management<br />for your <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">family</span>
          </h2>
          <p className="text-slate-300 text-sm mt-4">Sign in to your family account</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 text-sm mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2 relative">
            <label className="block text-sm font-medium text-slate-200">Email</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="email" required autoComplete="email"
                value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all duration-300" 
                placeholder="demo@familyfinance.in"
              />
            </div>
          </div>
          <div className="space-y-2 relative">
            <label className="block text-sm font-medium text-slate-200">Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type={showPw ? 'text' : 'password'} required
                value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-12 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all duration-300" 
                placeholder="••••••••"
              />
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors duration-300">
                {showPw ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-xl hover:shadow-blue-500/20 hover:scale-[1.01] active:scale-95 transition-all duration-300 disabled:opacity-70">
            {loading ? <><Loader2 size={20} className="animate-spin" /> Signing in…</> : 'Sign In'}
          </button>
        </form>

        <div className="text-center mt-8">
          <p className="text-slate-400 text-sm">
            No account?{' '}
            <Link to="/signup" className="text-cyan-400 hover:text-cyan-300 font-semibold transition-colors duration-300">Create one</Link>
          </p>
        </div>

        <div className="mt-12 bg-white/5 border border-white/10 rounded-2xl p-5 text-xs text-slate-300 space-y-2 backdrop-blur-md">
          <p className="font-bold text-white mb-2 uppercase tracking-widest text-[10px] opacity-70">Demo Preview</p>
          <div className="flex justify-between items-center">
            <span className="opacity-60">Email:</span>
            <span className="font-mono text-cyan-300 select-all">demo@familyfinance.in</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="opacity-60">Password:</span>
            <span className="font-mono text-cyan-300 select-all">password123</span>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
