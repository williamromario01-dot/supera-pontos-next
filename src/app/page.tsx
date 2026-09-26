'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, UserCheck, GraduationCap } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Não foi possível realizar o login.');
        return;
      }

      router.push('/dashboard');
    } catch (error) {
      console.error(error);
      setError('Não foi possível conectar ao servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-200">

        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-blue-600">
            Supera Pontos
          </h1>

          <p className="text-sm text-slate-500 mt-2">
            Acesse sua conta para acompanhar seus pontos e conquistas
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
              E-mail
            </label>

            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu.email@supera.com"
              className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
              Senha
            </label>

            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold rounded-lg transition-colors shadow-md text-sm"
          >
            {loading ? 'Entrando...' : 'Entrar no Sistema'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-200 text-xs text-slate-500 space-y-3">

          <p className="font-semibold text-slate-700">
            Acesso ao sistema
          </p>

          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>
              <b>Super Administrador</b>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-600" />
            <span>
              <b>Educador</b>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-amber-600" />
            <span>
              <b>Aluno</b>
            </span>
          </div>

        </div>
      </div>
    </div>
  );
}
