"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  cargarSesion,
  getReglasCA,
  crearReglaCA,
  actualizarReglaCA,
  toggleReglaCA,
  eliminarReglaCA,
} from "../../../lib/api";
import type { ReglaAcceso, ReglaAccesoCreate } from "../../../lib/types";

// ── Constants ──────────────────────────────────────────────────────────────

const DIAS = [
  { key: "lunes", label: "L" },
  { key: "martes", label: "M" },
  { key: "miércoles", label: "X" },
  { key: "jueves", label: "J" },
  { key: "viernes", label: "V" },
  { key: "sábado", label: "S" },
  { key: "domingo", label: "D" },
];

const TIPOS = [
  { key: "estudiante", label: "Estudiante" },
  { key: "docente", label: "Docente" },
  { key: "administrativo", label: "Administrativo" },
  { key: "servicios_generales", label: "Servicios generales" },
  { key: "visitante", label: "Visitante" },
];

const TIPO_COLORS: Record<string, string> = {
  estudiante: "bg-blue-100 text-blue-700",
  docente: "bg-violet-100 text-violet-700",
  administrativo: "bg-amber-100 text-amber-700",
  servicios_generales: "bg-emerald-100 text-emerald-700",
  visitante: "bg-slate-100 text-slate-600",
};

function formatHora(h: string) {
  // "08:00:00" → "08:00"
  return h?.slice(0, 5) ?? h;
}

// ── FormState ──────────────────────────────────────────────────────────────

interface FormState {
  nombre: string;
  dias: string[];
  hora_inicio: string;
  hora_fin: string;
  tipos_permitidos: string[];
}

const FORM_EMPTY: FormState = {
  nombre: "",
  dias: [],
  hora_inicio: "07:00",
  hora_fin: "18:00",
  tipos_permitidos: [],
};

function reglaToForm(r: ReglaAcceso): FormState {
  return {
    nombre: r.nombre ?? "",
    dias: r.dias,
    hora_inicio: formatHora(r.hora_inicio),
    hora_fin: formatHora(r.hora_fin),
    tipos_permitidos: r.tipos_permitidos,
  };
}

// ── Modal ──────────────────────────────────────────────────────────────────

function ReglaModal({
  initial,
  onSave,
  onCancel,
  saving,
  error,
}: {
  initial: FormState;
  onSave: (f: FormState) => void;
  onCancel: () => void;
  saving: boolean;
  error: string;
}) {
  const [form, setForm] = useState<FormState>(initial);

  function toggleDia(dia: string) {
    setForm((f) => ({
      ...f,
      dias: f.dias.includes(dia) ? f.dias.filter((d) => d !== dia) : [...f.dias, dia],
    }));
  }

  function toggleTipo(tipo: string) {
    setForm((f) => ({
      ...f,
      tipos_permitidos: f.tipos_permitidos.includes(tipo)
        ? f.tipos_permitidos.filter((t) => t !== tipo)
        : [...f.tipos_permitidos, tipo],
    }));
  }

  function seleccionarSemanaLaboral() {
    setForm((f) => ({
      ...f,
      dias: ["lunes", "martes", "miércoles", "jueves", "viernes"],
    }));
  }

  function seleccionarTodos() {
    setForm((f) => ({
      ...f,
      dias: DIAS.map((d) => d.key),
    }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">
            {initial === FORM_EMPTY ? "Nueva regla de acceso" : "Editar regla"}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Define cuándo y para quién está habilitado el acceso
          </p>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5 max-h-[70vh] overflow-y-auto">
          {/* Nombre opcional */}
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1.5 block">
              Nombre de la regla <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              placeholder="Ej: Horario laboral estudiantes"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
          </div>

          {/* Días */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-600">Días</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={seleccionarSemanaLaboral}
                  className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
                >
                  Lun–Vie
                </button>
                <span className="text-slate-200">|</span>
                <button
                  type="button"
                  onClick={seleccionarTodos}
                  className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
                >
                  Todos
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              {DIAS.map((d) => {
                const active = form.dias.includes(d.key);
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => toggleDia(d.key)}
                    className={`flex-1 h-9 rounded-xl text-xs font-bold transition-colors ${
                      active
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Horario */}
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-2 block">Rango horario</label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-[11px] text-slate-400 mb-1">Desde</p>
                <input
                  type="time"
                  value={form.hora_inicio}
                  onChange={(e) => setForm((f) => ({ ...f, hora_inicio: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                />
              </div>
              <div className="text-slate-300 mt-4">→</div>
              <div className="flex-1">
                <p className="text-[11px] text-slate-400 mb-1">Hasta</p>
                <input
                  type="time"
                  value={form.hora_fin}
                  onChange={(e) => setForm((f) => ({ ...f, hora_fin: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                />
              </div>
            </div>
          </div>

          {/* Tipos */}
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-2 block">
              Tipos de personal permitidos
            </label>
            <div className="flex flex-wrap gap-2">
              {TIPOS.map((t) => {
                const active = form.tipos_permitidos.includes(t.key);
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => toggleTipo(t.key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                      active
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-3 border-t border-slate-100 flex gap-3">
          <button
            onClick={() => onSave(form)}
            disabled={saving}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Guardando...
              </>
            ) : (
              "Guardar regla"
            )}
          </button>
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-5 py-2.5 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors font-medium"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ReglasCAPage() {
  const router = useRouter();
  const [reglas, setReglas] = useState<ReglaAcceso[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<ReglaAcceso | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState("");
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    const sesion = cargarSesion();
    if (!sesion || sesion.rol !== "jefe_seguridad") {
      router.replace("/login");
      return;
    }
    cargar();
  }, [router]);

  async function cargar() {
    try {
      const data = await getReglasCA();
      setReglas(data);
    } catch {
      /* silent */
    } finally {
      setCargando(false);
    }
  }

  function abrirNueva() {
    setEditando(null);
    setFormError("");
    setModalOpen(true);
  }

  function abrirEditar(r: ReglaAcceso) {
    setEditando(r);
    setFormError("");
    setModalOpen(true);
  }

  async function handleGuardar(form: FormState) {
    if (form.dias.length === 0) {
      setFormError("Selecciona al menos un día.");
      return;
    }
    if (form.tipos_permitidos.length === 0) {
      setFormError("Selecciona al menos un tipo de personal.");
      return;
    }
    if (form.hora_inicio >= form.hora_fin) {
      setFormError("La hora de inicio debe ser anterior a la hora de fin.");
      return;
    }
    setGuardando(true);
    setFormError("");
    const payload: ReglaAccesoCreate = {
      nombre: form.nombre || undefined,
      dias: form.dias,
      hora_inicio: form.hora_inicio + ":00",
      hora_fin: form.hora_fin + ":00",
      tipos_permitidos: form.tipos_permitidos,
    };
    try {
      if (editando) {
        const updated = await actualizarReglaCA(editando.id, payload);
        setReglas((prev) => prev.map((r) => (r.id === editando.id ? updated : r)));
      } else {
        const nueva = await crearReglaCA(payload);
        setReglas((prev) => [...prev, nueva]);
      }
      setModalOpen(false);
      setEditando(null);
    } catch (err: any) {
      setFormError(err.message || "Error al guardar la regla.");
    } finally {
      setGuardando(false);
    }
  }

  async function handleToggle(id: string) {
    try {
      const updated = await toggleReglaCA(id);
      setReglas((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch {
      /* silent */
    }
  }

  async function handleEliminar(id: string) {
    setEliminandoId(id);
    try {
      await eliminarReglaCA(id);
      setReglas((prev) => prev.filter((r) => r.id !== id));
    } catch {
      /* silent */
    } finally {
      setEliminandoId(null);
      setConfirmDelete(null);
    }
  }

  const reglasActivas = reglas.filter((r) => r.activa).length;

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Reglas de control de acceso</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Define días, horarios y tipos de personal autorizados
          </p>
        </div>
        <button
          onClick={abrirNueva}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Nueva regla
        </button>
      </div>

      {/* Info banner */}
      <div className="flex gap-3 items-start bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3.5 mb-5 text-sm">
        <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
        </svg>
        <span className="text-blue-700">
          {reglas.length === 0
            ? "Sin reglas configuradas — el acceso está abierto para todos los tipos de personal en cualquier momento."
            : reglasActivas === 0
            ? "Todas las reglas están inactivas — el acceso está abierto actualmente."
            : `${reglasActivas} regla${reglasActivas > 1 ? "s" : ""} activa${reglasActivas > 1 ? "s" : ""}. Solo se permitirán accesos que coincidan con al menos una regla.`}
        </span>
      </div>

      {/* Loading */}
      {cargando && (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!cargando && reglas.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center py-16 px-8 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-slate-700 mb-1">No hay reglas configuradas</p>
          <p className="text-xs text-slate-400 mb-5 max-w-xs">
            El sistema opera en modo abierto. Crea una regla para restringir accesos por día, horario y tipo de personal.
          </p>
          <button
            onClick={abrirNueva}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Crear primera regla
          </button>
        </div>
      )}

      {/* Reglas list */}
      {!cargando && reglas.length > 0 && (
        <div className="flex flex-col gap-3">
          {reglas.map((regla) => (
            <ReglaCard
              key={regla.id}
              regla={regla}
              onEditar={() => abrirEditar(regla)}
              onToggle={() => handleToggle(regla.id)}
              onEliminar={() => setConfirmDelete(regla.id)}
              eliminando={eliminandoId === regla.id}
            />
          ))}
        </div>
      )}

      {/* Modal editar/crear */}
      {modalOpen && (
        <ReglaModal
          initial={editando ? reglaToForm(editando) : FORM_EMPTY}
          onSave={handleGuardar}
          onCancel={() => { setModalOpen(false); setEditando(null); }}
          saving={guardando}
          error={formError}
        />
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <p className="text-sm font-bold text-slate-800 mb-1">¿Eliminar esta regla?</p>
            <p className="text-xs text-slate-500 mb-5">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button
                onClick={() => handleEliminar(confirmDelete)}
                disabled={eliminandoId !== null}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                Eliminar
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ReglaCard ───────────────────────────────────────────────────────────────

function ReglaCard({
  regla,
  onEditar,
  onToggle,
  onEliminar,
  eliminando,
}: {
  regla: ReglaAcceso;
  onEditar: () => void;
  onToggle: () => void;
  onEliminar: () => void;
  eliminando: boolean;
}) {
  const diasOrdenados = DIAS.filter((d) => regla.dias.includes(d.key));

  return (
    <div className={`bg-white rounded-2xl border transition-colors ${regla.activa ? "border-slate-100" : "border-slate-100 opacity-60"}`}>
      <div className="px-5 py-4 flex items-start gap-4">
        {/* Indicador activa */}
        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${regla.activa ? "bg-emerald-400" : "bg-slate-300"}`} />

        {/* Contenido */}
        <div className="flex-1 min-w-0">
          {/* Nombre + horario */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {regla.nombre && (
              <span className="text-sm font-semibold text-slate-800">{regla.nombre}</span>
            )}
            <span className="flex items-center gap-1 bg-slate-100 text-slate-600 text-xs font-mono font-semibold px-2.5 py-0.5 rounded-lg">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              {formatHora(regla.hora_inicio)} – {formatHora(regla.hora_fin)}
            </span>
          </div>

          {/* Días */}
          <div className="flex gap-1.5 mb-2.5 flex-wrap">
            {DIAS.map((d) => {
              const activo = regla.dias.includes(d.key);
              return (
                <span
                  key={d.key}
                  className={`w-6 h-6 rounded-lg text-[11px] font-bold flex items-center justify-center ${
                    activo ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-300"
                  }`}
                >
                  {d.label}
                </span>
              );
            })}
          </div>

          {/* Tipos */}
          <div className="flex flex-wrap gap-1.5">
            {regla.tipos_permitidos.map((t) => (
              <span
                key={t}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${TIPO_COLORS[t] ?? "bg-slate-100 text-slate-600"}`}
              >
                {TIPOS.find((tp) => tp.key === t)?.label ?? t}
              </span>
            ))}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Toggle */}
          <button
            onClick={onToggle}
            title={regla.activa ? "Desactivar" : "Activar"}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
              regla.activa
                ? "text-emerald-600 bg-emerald-50 hover:bg-emerald-100"
                : "text-slate-400 bg-slate-100 hover:bg-slate-200"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              {regla.activa ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
              )}
            </svg>
          </button>

          {/* Editar */}
          <button
            onClick={onEditar}
            title="Editar"
            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
            </svg>
          </button>

          {/* Eliminar */}
          <button
            onClick={onEliminar}
            disabled={eliminando}
            title="Eliminar"
            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
          >
            {eliminando ? (
              <div className="w-3.5 h-3.5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
