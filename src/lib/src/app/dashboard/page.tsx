'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BADGES, SCORE_TIERS } from '@/lib/types';
import { PlusCircle, ShoppingBag, MessageSquare, LogOut, Users, Award } from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const [role, setRole] = useState<string>('student');
  const [name, setName] = useState<string>('');
  const [points, setPoints] = useState<number>(1250);

  useEffect(() => {
    const savedRole = localStorage.getItem('user_role') || 'student';
    const savedName = localStorage.getItem('user_name') || 'Usuário';
    const savedPoints = parseInt(localStorage.getItem('user_points') || '1250', 10);

    setRole(savedRole);
    setName(savedName);
    setPoints(savedPoints);
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    router.push('/');
  };

  const currentBadge = [...BADGES].reverse().find(b => points >= b.threshold) || {
    name: 'Iniciante',
    threshold: 0,
    color: '#94A3B8',
    icon: '🌱'
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-blue-600">Supera Pontos</h1>
          <p className="text-xs text-slate-500">Bem-vindo(a), {name} ({role.replace('_', ' ').toUpperCase()})</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-xs font-semibold text-rose-600 hover:text-rose-800 transition-colors"
        >
          <LogOut className="w-4 h-4" /> Sair
        </button>
      </header>

      <main className="p-6 max-w-6xl w-full mx-auto space-y-6 flex-1">
        {role === 'student' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl p-6 shadow-lg flex flex-col justify-between">
              <div>
                <span className="text-xs uppercase tracking-wider text-blue-200 font-bold">Saldo de Pontos</span>
                <h2 className="text-5xl font-black mt-2">{points} <span className="text-xl font-medium">pts</span></h2>
              </div>
              <div className="mt-6 pt-4 border-t border-blue-500/40 text-xs text-blue-100">
                Resgate prêmios na loja com seus pontos acumulados!
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-md border border-slate-200 flex flex-col justify-between">
              <div>
                <span className="text-xs uppercase tracking-wider text-slate-400 font-bold">Conquista Atual</span>
                <div className="flex items-center gap-3 mt-3">
                  <span className="text-4xl">{currentBadge.icon}</span>
                  <div>
                    <h3 className="text-2xl font-bold" style={{ color: currentBadge.color }}>{currentBadge.name}</h3>
                    <p className="text-xs text-slate-500">A partir de {currentBadge.threshold} pontos</p>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100">
                <span className="text-xs font-semibold text-slate-600 mb-2 block">Níveis de Gamificação:</span>
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  {BADGES.map((badge) => (
                    <div
                      key={badge.name}
                      className={`p-2 rounded-lg border ${
                        points >= badge.threshold
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-900 font-bold'
                          : 'border-slate-200 bg-slate-50 text-slate-400'
                      }`}
                    >
                      <div>{badge.icon}</div>
                      <div className="text-[10px] mt-1">{badge.name}</div>
                      <div className="text-[9px] text-slate-500">{badge.threshold} pts</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {(role === 'educator' || role === 'super_admin') && (
          <div className="bg-white rounded-2xl p-6 shadow-md border border-slate-200 space-y-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-blue-600" />
              Lançar Pontuação para Aluno
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {SCORE_TIERS.map((tier, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-slate-200 hover:border-blue-500 transition-colors flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold text-blue-600 uppercase">{tier.category}</span>
                    <h3 className="text-2xl font-black text-slate-800 mt-1">+{tier.points} pts</h3>
                  </div>
                  <button className="mt-4 w-full py-2 bg-slate-900 hover:bg-blue-600 text-white rounded-lg text-xs font-bold transition-colors">
                    Atribuir Pontos
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {role === 'super_admin' && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-bold text-amber-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-600" />
              Painel do Super Administrador
            </h2>
            <p className="text-xs text-amber-700 mt-1">
              Acesso exclusivo a configurações de tema, gestão de usuários e onboarding via CSV.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
            <ShoppingBag className="w-8 h-8 text-indigo-600" />
            <div>
              <h4 className="font-bold text-sm text-slate-800">Loja de Prêmios</h4>
              <p className="text-xs text-slate-500">Resgate recompensas com seus pontos</p>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
            <MessageSquare className="w-8 h-8 text-emerald-600" />
            <div>
              <h4 className="font-bold text-sm text-slate-800">Chats por Categoria</h4>
              <p className="text-xs text-slate-500">Tire dúvidas e converse em grupo</p>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
            <Award className="w-8 h-8 text-amber-500" />
            <div>
              <h4 className="font-bold text-sm text-slate-800">Indique um Amigo</h4>
              <p className="text-xs text-slate-500">Ganhe +100 pts a cada conversão</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
