"use client";

/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Trash2, Users, X } from "lucide-react";

type Group = { id: string; name: string; participantCount: number };
type Person = { id: string; name: string; role: string };
type Book = { id: string; name: string };
type Assignment = { id: string; classId: string; bookName: string; metrics?: { progressPercentage: number; projectedCompletionDate: string | null } };
type Activity = { id: string; participantId: string; reportedQuantity: number; status: string; revision: number };
type Pendency = { id: string; requiredPointsReversal: number };
type Payload = { classes?: Group[]; books?: Book[]; assignments?: Assignment[]; activities?: Activity[]; pendencies?: Pendency[]; participants?: Person[]; availableParticipants?: Person[]; error?: string };

export default function CollaboratorClassManagement({ role, schoolId }: { role?: string; schoolId: string }) {
  const allowed = ["admin", "company_admin", "super_admin"].includes(role ?? "");
  const query = `?schoolId=${encodeURIComponent(schoolId)}`;
  const [groups, setGroups] = useState<Group[]>([]);
  const [selected, setSelected] = useState("");
  const [participants, setParticipants] = useState<Person[]>([]);
  const [available, setAvailable] = useState<Person[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [pendencies, setPendencies] = useState<Pendency[]>([]);
  const [name, setName] = useState("COLABORADORES");
  const [person, setPerson] = useState("");
  const [book, setBook] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Group | null>(null);
  const [editName, setEditName] = useState("");

  const load = useCallback(async () => {
    if (!allowed) return;
    const urls = ["classes", "assignments", "activities", "adjustments"].map((path) => `/api/collaborator-development/${path}${query}`);
    const responses = await Promise.all([fetch(urls[0]), fetch(`/api/learning/books${query}`), ...urls.slice(1).map((url) => fetch(url))]);
    const bodies = await Promise.all(responses.map(async (response): Promise<Payload> => response.ok ? response.json() : {}));
    setGroups(bodies[0].classes ?? []);
    setBooks(bodies[1].books ?? []);
    setAssignments(bodies[2].assignments ?? []);
    setActivities(bodies[3].activities ?? []);
    setPendencies(bodies[4].pendencies ?? []);
  }, [allowed, query]);

  const loadPeople = useCallback(async () => {
    if (!selected) return;
    const response = await fetch(`/api/collaborator-development/classes/${selected}/participants${query}`, { cache: "no-store" });
    if (!response.ok) return;
    const body = (await response.json()) as Payload;
    setParticipants(body.participants ?? []);
    setAvailable(body.availableParticipants ?? []);
  }, [query, selected]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadPeople(); }, [loadPeople]);

  async function mutate(url: string, method: string, body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ ...body, schoolId }) });
      if (!response.ok) {
        setError(((await response.json()) as Payload).error ?? "Operação não concluída.");
        return false;
      }
      await Promise.all([load(), loadPeople()]);
      return true;
    } finally { setBusy(false); }
  }

  async function renameGroup() {
    if (!editing || !editName.trim()) return;
    if (await mutate(`/api/collaborator-development/classes/${editing.id}${query}`, "PATCH", { name: editName.trim() })) {
      if (selected === editing.id) setName(editName.trim());
      setEditing(null);
    }
  }

  async function deleteGroup(group: Group) {
    if (group.participantCount > 0 || !window.confirm(`Deseja excluir a turma ${group.name}? Esta ação não poderá ser desfeita.`)) return;
    if (await mutate(`/api/collaborator-development/classes/${group.id}${query}`, "DELETE", {})) {
      if (selected === group.id) {
        setSelected("");
        setParticipants([]);
        setAvailable([]);
      }
    }
  }

  if (!allowed) return null;
  const pending = activities.filter((activity) => activity.status === "pending" && participants.some((participant) => participant.id === activity.participantId));

  return <section className="mt-8 rounded-3xl border border-orange-100 bg-white p-5 shadow-sm">
    <h2 className="text-xl font-black">Turmas de colaboradores</h2>
    <p className="text-sm text-slate-500">Desenvolvimento profissional separado das turmas de alunos.</p>
    {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-rose-700">{error}</p>}

    <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]">
      <input aria-label="Nome da turma de colaboradores" value={name} onChange={(event) => setName(event.target.value)} className="rounded-xl border p-3" />
      <button disabled={busy || !name.trim()} onClick={() => mutate(`/api/collaborator-development/classes${query}`, "POST", { name })} className="rounded-xl bg-slate-900 px-4 font-bold text-white">Criar turma</button>
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((group) => <article key={group.id} className={`rounded-2xl border p-4 transition ${selected === group.id ? "border-orange-300 bg-orange-50/40" : "border-slate-200"}`}>
        <div className="flex items-start justify-between gap-3">
          <button type="button" onClick={() => { setSelected(group.id); setName(group.name); }} className="min-w-0 flex-1 text-left">
            <strong className="block truncate text-slate-900">{group.name}</strong>
            <span className="mt-1 flex items-center gap-1 text-sm text-slate-500"><Users className="h-4 w-4" />{group.participantCount} participante(s)</span>
          </button>
          <span className="flex shrink-0 gap-1">
            <button type="button" aria-label={`Alterar nome da turma ${group.name}`} title="Alterar nome" onClick={() => { setEditing(group); setEditName(group.name); }} className="rounded-lg p-2 text-slate-400 hover:bg-orange-100 hover:text-orange-600"><Pencil className="h-4 w-4" /></button>
            <button type="button" aria-label={`Excluir turma ${group.name}`} title={group.participantCount > 0 ? "Para excluir esta turma, remova todos os participantes primeiro." : "Excluir turma"} disabled={busy || group.participantCount > 0} onClick={() => void deleteGroup(group)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-100 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-slate-400"><Trash2 className="h-4 w-4" /></button>
          </span>
        </div>
        {group.participantCount > 0 && <p className="mt-3 text-xs text-slate-500">Para excluir esta turma, remova todos os participantes primeiro.</p>}
      </article>)}
    </div>

    {selected && <div className="mt-5 space-y-6">
      <div><h3 className="font-bold">Participantes</h3><div className="mt-2 flex flex-col gap-2 sm:flex-row"><select aria-label="Colaborador existente" value={person} onChange={(event) => setPerson(event.target.value)} className="min-w-0 flex-1 rounded-xl border p-3"><option value="">Educador ou administrador existente</option>{available.map((item) => <option key={item.id} value={item.id}>{item.name} • {item.role}</option>)}</select><button disabled={!person || busy} onClick={() => mutate(`/api/collaborator-development/classes/${selected}/participants${query}`, "POST", { participantId: person })} className="rounded-xl bg-orange-500 px-4 font-bold text-white">Adicionar</button></div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">{participants.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span>{item.name}<small className="block text-slate-500">{item.role}</small></span><button aria-label={`Remover ${item.name}`} onClick={() => mutate(`/api/collaborator-development/classes/${selected}/participants${query}`, "DELETE", { participantId: item.id })}>Remover</button></div>)}</div>
      </div>

      <div><h3 className="font-bold">Livros e progresso</h3><div className="mt-2 grid gap-2 sm:grid-cols-3"><select aria-label="Participante do livro" value={target} onChange={(event) => setTarget(event.target.value)} className="rounded-xl border p-3"><option value="">Participante</option>{participants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Livro cadastrado" value={book} onChange={(event) => setBook(event.target.value)} className="rounded-xl border p-3"><option value="">Livro cadastrado</option>{books.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button disabled={!target || !book || busy} onClick={() => mutate(`/api/collaborator-development/assignments${query}`, "POST", { classId: selected, participantId: target, bookId: book, startDate: new Date().toISOString().slice(0, 10), studyDaysPerWeek: [1, 2, 3, 4, 5] })} className="rounded-xl bg-slate-900 p-3 font-bold text-white">Vincular livro</button></div>
        <div className="mt-3 grid gap-2">{assignments.filter((item) => item.classId === selected).map((item) => <div key={item.id} className="rounded-xl border p-3 text-sm"><strong>{item.bookName}</strong> • {Math.round(item.metrics?.progressPercentage ?? 0)}% • projeção {item.metrics?.projectedCompletionDate ?? "—"}</div>)}</div>
      </div>

      <div><h3 className="font-bold">Atividades pendentes</h3>{pending.length === 0 && <p className="text-sm text-slate-500">Nenhuma atividade pendente.</p>}{pending.map((item) => <div key={item.id} className="mt-2 flex flex-wrap justify-between gap-2 rounded-xl bg-amber-50 p-3"><span>{item.reportedQuantity} questão(ões)</span><span className="flex gap-3"><button className="font-bold text-emerald-700" onClick={() => mutate(`/api/collaborator-development/activities/${item.id}/review${query}`, "POST", { decision: "approved", approvedQuantity: item.reportedQuantity, expectedActivityRevision: item.revision })}>Aprovar</button><button className="font-bold text-rose-700" onClick={() => mutate(`/api/collaborator-development/activities/${item.id}/review${query}`, "POST", { decision: "rejected", approvedQuantity: 0, expectedActivityRevision: item.revision })}>Rejeitar</button></span></div>)}</div>

      {pendencies.length > 0 && <div><h3 className="font-bold">Pendências administrativas</h3>{pendencies.map((item) => <div key={item.id} className="mt-2 flex flex-wrap justify-between gap-2 rounded-xl bg-rose-50 p-3"><span>Reversão protegida: {item.requiredPointsReversal} ponto(s)</span><span className="flex gap-3"><button className="font-bold" onClick={() => mutate(`/api/collaborator-development/adjustments/${item.id}${query}`, "POST", { action: "resolve" })}>Resolver</button><button className="font-bold text-rose-700" onClick={() => mutate(`/api/collaborator-development/adjustments/${item.id}${query}`, "POST", { action: "cancel" })}>Cancelar</button></span></div>)}</div>}
    </div>}
    {busy && <p aria-live="polite" className="mt-3 text-sm text-orange-600">Processando…</p>}
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="edit-collaborator-class-title">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b p-5 sm:p-6">
          <div className="min-w-0"><h3 id="edit-collaborator-class-title" className="text-xl font-bold">Alterar nome da turma</h3><p className="mt-1 truncate text-sm text-slate-500">Nome atual: {editing.name}</p></div>
          <button type="button" aria-label="Fechar" onClick={() => setEditing(null)} className="rounded-lg p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-5 p-5 sm:p-6">
          <div><label htmlFor="collaborator-class-name" className="mb-1 block text-sm font-medium">Novo nome</label><input id="collaborator-class-name" value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={100} autoFocus className="w-full rounded-xl border p-3 focus:outline-none focus:ring-2 focus:ring-orange-500" /></div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={() => setEditing(null)} className="rounded-xl border px-4 py-2.5 font-medium">Cancelar</button><button type="button" disabled={busy || !editName.trim()} onClick={() => void renameGroup()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 font-bold text-white disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Salvar</button></div>
        </div>
      </div>
    </div>}
  </section>;
}
