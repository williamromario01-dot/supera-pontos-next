"use client";
import { useEffect, useState } from "react";

export default function ClassEducatorAssignment({ classId, schoolId }: { classId: string; schoolId: string }) {
  const [role, setRole] = useState("");
  const [educatorId, setEducatorId] = useState("");
  const [name, setName] = useState("Não alocado");
  const [educators, setEducators] = useState<Array<{ id: string; name: string }>>([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const query = `?schoolId=${encodeURIComponent(schoolId)}`;
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/classes/${classId}${query}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        const me = await fetch("/api/auth/me"); const user = await me.json();
        if (cancelled) return;
        setRole(user.user?.role || ""); setEducatorId(data.class.educatorId || ""); setName(data.class.educator?.name || "Não alocado");
        if (["admin", "super_admin"].includes(user.user?.role)) {
          const list = await fetch(`/api/educators${query}`); const body = await list.json();
          if (!list.ok) throw new Error(body.error);
          if (!cancelled) setEducators((body.educators || []).filter((item: { active: boolean; schoolId: string; role: string }) => item.active !== false && item.schoolId === schoolId && item.role === "educator"));
        }
      } catch (error) { if (!cancelled) setMessage(error instanceof Error ? error.message : "Erro ao carregar educador."); }
    }
    void load(); return () => { cancelled = true; };
  }, [classId, query, schoolId]);
  async function save(remove = false) {
    if (remove && !window.confirm("Remover a alocação do educador responsável?")) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/classes/${classId}${query}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ educatorId: remove ? null : educatorId }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setName(remove ? "Não alocado" : educators.find((item) => item.id === educatorId)?.name || "Não alocado");
      if (remove) setEducatorId(""); setEditing(false); setMessage("Alocação atualizada.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Erro ao salvar."); } finally { setBusy(false); }
  }
  return <div className="mt-4 space-y-3 text-sm">
    <p>Educador responsável: <strong>{name}</strong></p>
    {["admin", "super_admin"].includes(role) && <>
      <button type="button" className="rounded-xl border border-orange-300 px-3 py-2 font-semibold text-orange-700" onClick={() => setEditing(!editing)}>{name === "Não alocado" ? "Alocar educador" : "Trocar educador"}</button>
      {name !== "Não alocado" && <button type="button" disabled={busy} className="ml-2 px-3 py-2 text-red-700" onClick={() => save(true)}>Remover alocação</button>}
      {editing && <div className="flex flex-wrap gap-2"><label className="w-full">Educador ativo<select className="mt-1 w-full rounded-xl border p-2" value={educatorId} onChange={(event) => setEducatorId(event.target.value)}><option value="">Selecione</option>{educators.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button type="button" disabled={busy || !educatorId} className="rounded-xl bg-orange-500 px-4 py-2 text-white disabled:opacity-50" onClick={() => save()}>Salvar</button></div>}
    </>}
    <p role="status">{message}</p>
  </div>;
}
