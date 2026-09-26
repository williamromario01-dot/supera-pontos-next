'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Loader2 } from 'lucide-react';

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

useEffect(() => {
async function loadUser() {
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
    console.error(error);
    router.replace('/');
  } finally {
    setLoading(false);
  }
}

loadUser();
```

}, [router]);

async function handleLogout() {
try {
await fetch('/api/auth/logout', {
method: 'POST',
credentials: 'include',
});
} catch (error) {
console.error(error);
}

```
router.replace('/');
```

}

if (loading) {
return ( <main className="min-h-screen flex items-center justify-center bg-slate-100"> <div className="text-center"> <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" /> <p className="mt-3 text-sm text-slate-500">
Carregando painel... </p> </div> </main>
);
}

if (!user) {
return null;
}

return ( <main className="min-h-screen bg-slate-100">

```
  <header className="bg-white border-b border-slate-200 px-6 py-5">
    <div className="max-w-6xl mx-auto flex items-center justify-between">

      <div>
        <h1 className="text-2xl font-bold text-blue-600">
          Supera Pontos
        </h1>

        <p className="text-sm text-slate-500 mt-1">
          Olá, <strong>{user.name}</strong>!
        </p>

        <p className="text-xs text-slate-400 mt-1">
          {user.role}
        </p>
      </div>

      <button
        onClick={handleLogout}
        className="flex items-center gap-2 text-sm font-semibold text-red-600 hover:text-red-800"
      >
        <LogOut className="w-4 h-4" />
        Sair
      </button>

    </div>
  </header>

  <section className="max-w-6xl mx-auto p-6">

    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">

      <p className="text-sm text-slate-500">
        Usuário autenticado
      </p>

      <h2 className="text-3xl font-bold text-slate-800 mt-2">
        {user.name}
      </h2>

      <p className="text-sm text-slate-500 mt-2">
        {user.email}
      </p>

      <div className="mt-8 bg-blue-50 rounded-xl p-6">

        <p className="text-xs uppercase font-bold text-blue-600">
          Pontos
        </p>

        <p className="text-5xl font-black text-blue-700 mt-2">
          {user.points}
        </p>

      </div>

    </div>

  </section>

</main>
```

);
}
