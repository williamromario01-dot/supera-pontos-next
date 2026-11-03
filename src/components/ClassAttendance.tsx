"use client";
import { useState } from "react";
import type { AttendanceStudent } from "@/lib/attendance-core";

export default function ClassAttendance({ classId, schoolId }: { classId: string; schoolId: string }) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [date, setDate] = useState(today);
  const [session, setSession] = useState("Aula 1");
  const [students, setStudents] = useState<AttendanceStudent[] | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [audit, setAudit] = useState<Array<{ at: string; reason: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const endpoint = `/api/classes/${classId}/attendance?schoolId=${encodeURIComponent(schoolId)}`;
  async function load() {
    setBusy(true); setMessage(""); setStudents(null);
    try {
      const response = await fetch(`${endpoint}&date=${encodeURIComponent(date)}&session=${encodeURIComponent(session.trim())}`, { cache: "no-store" });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      setStudents(body.record?.students || body.students); setVersion(body.record?.version ?? null); setAudit(body.record?.audit || []); setReason("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Erro ao consultar chamada."); } finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(endpoint, { method: version === null ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, session: session.trim(), students, version, reason }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      await load(); setMessage(body.message);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Erro ao salvar chamada."); } finally { setBusy(false); }
  }
  return <section className="my-6 rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
    <h2 className="text-xl font-bold text-slate-900">Chamada da turma</h2>
    <p className="mt-1 text-sm text-slate-500">Cada aula tem uma sessão própria. Dias sem chamada não geram faltas. A chamada não lança pontos.</p>
    <div className="my-4 flex flex-wrap items-end gap-3">
      <label>Data<input type="date" max={today} value={date} disabled={busy} onChange={(event) => { setDate(event.target.value); setStudents(null); }} className="mt-1 block rounded-xl border p-2" /></label>
      <label>Sessão da aula<input maxLength={80} value={session} disabled={busy} onChange={(event) => { setSession(event.target.value); setStudents(null); }} className="mt-1 block rounded-xl border p-2" placeholder="Ex.: Aula 1, Aula 2" /></label>
      <button disabled={busy || !date || !session.trim()} className="rounded-xl bg-orange-500 px-4 py-2 text-white disabled:opacity-50" onClick={load}>Consultar chamada</button>
    </div>
    {students && <><p className="mb-2 text-sm font-semibold">{version === null ? "Nova chamada — confira todos os alunos" : `Chamada registrada — versão ${version}`}</p>
      <div className="space-y-2">{students.map((student, index) => <fieldset key={student.studentId} disabled={busy} className="flex flex-wrap items-center gap-4 rounded-xl bg-slate-50 p-3"><legend className="sr-only">{student.studentName}</legend><span className="mr-auto">{student.studentName}</span>{[true, false].map((present) => <label key={String(present)} className="flex items-center gap-2"><input type="radio" name={`attendance-${student.studentId}`} checked={student.present === present} onChange={() => setStudents(students.map((item, i) => i === index ? { ...item, present } : item))}/>{present ? "Presente" : "Ausente"}</label>)}</fieldset>)}</div>
      {version !== null && <label className="mt-4 block">Motivo da correção<input className="mt-1 block w-full rounded-xl border p-2" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label>}
      <button disabled={busy || !students.length || (version !== null && !reason.trim())} onClick={save} className="mt-4 rounded-xl bg-orange-500 px-4 py-2 font-semibold text-white disabled:opacity-50">{version === null ? "Salvar chamada" : "Salvar correção"}</button>
      {audit.length > 0 && <details className="mt-4 text-sm"><summary>Histórico de alterações</summary>{audit.map((item, index) => <p key={index}>{new Date(item.at).toLocaleString("pt-BR")} — {item.reason}</p>)}</details>}
    </>}
    <p role="status" className="mt-3 text-sm">{message}</p>
  </section>;
}
