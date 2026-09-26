'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
ShoppingBag,
MessageSquare,
LogOut,
Users,
Award,
Loader2,
} from 'lucide-react';

interface UserData {
id: string;
name: string;
email: string;
role: string;
points: number;
}

export default function DashboardPage() {
const router = useRouter();

const [user, setUser] = useState<UserData | null>(null);
const [loading, setLoading] = useState(true);
const [loggingOut, setLoggingOut] = useState(false);

useEffect(() => {
const loadUser = async () => {
try {
const response = await fetch('/api/auth/me', {
method: 'GET',
credentials: 'include',
cache: 'no-store',
});

```
    if (!response.ok) {
      router.replace('/');
      return;
    }

    const data = await response.json();

    if (!data.user) {
      router.replace('/');
      return;
    }

    setUser(data.user);
  } catch (error) {
    console.error('Erro ao carregar usuário:', error);
    router.replace('/');
  } finally {
    setLoading(false);
  }
};

loadUser();
```

}, [router]);

const handleLogout = async () => {
if (loggingOut) return;

```
setLoggingOut(true);

try {
  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
} catch (error) {
  console.error('Erro ao realizar logout:', error);
} finally {
  router.replace('/');
}
```

};

if (loading) {
return ( <div className="min-h-screen bg-slate-100 flex items-center justify-center"> <div className="flex flex-col items-center gap-3 text-slate-500"> <Loader2 className="w-8 h-8 animate-spin text-blue-600" /> <p className="text-sm font-medium">
Carregando seu painel... </p> </div> </div>
);
}

if (!user) {
return null;
}

const roleLabels: Record<string, string> = {
super_admin: 'SUPER ADMINISTRADOR',
admin: 'ADMINISTRADOR',
educator: 'EDUCADOR',
student: 'ALUNO',
};

const roleLabel = roleLabels[user.role] || user.role.toUpperCase();

return ( <div className="min-h-screen bg-slate-100 flex flex-col">

```
  <header className="bg-white border-b border-slate-200 px-6 py-4">
    <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">

      <div>
        <h1 className="text-xl font-bold text-blue-600">
          Supera Pontos
        </h1>

        <p className="text-xs text-slate-500 mt-1">
          Bem-vindo(a), <strong>{user.name}</strong>
        </p>

        <span className="inline-block mt-1 text-[10px] font-bold text-slate-400 tracking-wide">
          {roleLabel}
        </span>
      </div>

      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className="flex items-center gap-2 text-xs font-semibold text-rose-600 hover:text-rose-800 disabled:opacity-50 transition-colors"
      >
        {loggingOut ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <LogOut className="w-4 h-4" />
        )}

        {loggingOut ? 'Saindo...' : 'Sair'}
      </button>

    </div>
  </header>

  <main className="p-6 max-w-6xl w-full mx-auto space-y-6 flex-1">

    {user.role === 'student' && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl p-6 shadow-lg flex flex-col justify-between">

          <div>
            <span className="text-xs uppercase tracking-wider text-blue-200 font-bold">
              Saldo de Pontos
            </span>

            <h2 className="text-5xl font-black mt-2">
              {user.points}
              <span className="text-xl font-medium ml-2">
                pts
              </span>
            </h2>
          </div>

          <div className="mt-6 pt-4 border-t border-blue-500/40 text-xs text-blue-100">
            Continue participando das atividades e acumulando pontos!
          </div>

        </div>

        <div className="bg-white rounded-2xl p-6 shadow-md border border-slate-200">

          <span className="text-xs uppercase tracking-wider text-slate-400 font-bold">
            Seu progresso
          </span>

          <div className="flex items-center gap-3 mt-4">

            <span className="text-4xl">
              🧠
            </span>

            <div>
              <h3 className="text-2xl font-bold text-blue-600">
                Em evolução
              </h3>

              <p className="text-xs text-slate-500 mt-1">
                Cada ponto representa seu esforço e dedicação.
              </p>
            </div>

          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <p className="text-sm text-slate-600">
              Continue treinando seu cérebro e acompanhe sua evolução!
            </p>
          </div>

        </div>

      </div>
    )}

    {(user.role === 'educator' ||
      user.role === 'admin' ||
      user.role === 'super_admin') && (

      <div className="bg-white rounded-2xl p-6 shadow-md border border-slate-200">

        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Award className="w-5 h-5 text-blue-600" />
          Área administrativa
        </h2>

        <p className="text-sm text-slate-500 mt-2">
          Usuário autenticado com sucesso. As ferramentas de
          gerenciamento de categorias, alunos, pontos e rankings serão
          adicionadas nas próximas etapas.
        </p>

      </div>
    )}

    {user.role === 'super_admin' && (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 shadow-sm">

        <h2 className="text-base font-bold text-amber-900 flex items-center gap-2">
          <Users className="w-5 h-5 text-amber-600" />
          Painel do Super Administrador
        </h2>

        <p className="text-xs text-amber-700 mt-2">
          Acesso exclusivo para gerenciamento de usuários,
          categorias, configurações e demais recursos administrativos.
        </p>

      </div>
    )}

    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">

        <ShoppingBag className="w-8 h-8 text-indigo-600" />

        <div>
          <h4 className="font-bold text-sm text-slate-800">
            Loja de Prêmios
          </h4>

          <p className="text-xs text-slate-500">
            Resgate recompensas com seus pontos
          </p>
        </div>

      </div>

      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">

        <MessageSquare className="w-8 h-8 text-emerald-600" />

        <div>
          <h4 className="font-bold text-sm text-slate-800">
            Chats por Categoria
          </h4>

          <p className="text-xs text-slate-500">
            Tire dúvidas e converse em grupo
          </p>
        </div>

      </div>

      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">

        <Award className="w-8 h-8 text-amber-500" />

        <div>
          <h4 className="font-bold text-sm text-slate-800">
            Indique um Amigo
          </h4>

          <p className="text-xs text-slate-500">
            Ganhe pontos a cada conversão
          </p>
        </div>

      </div>

    </div>

  </main>
</div>
```

);
}
