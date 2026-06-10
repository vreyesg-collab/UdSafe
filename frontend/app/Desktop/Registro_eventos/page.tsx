"use client";

import { useState, useEffect, useCallback } from "react";
import { getRegistroAccesos } from "../../../lib/api";
import type { RegistroAccesoEvento } from "../../../lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFechaCompleta(iso: string) {
  return new Date(iso).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function iniciales(nombre: string) {
  return nombre
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

// ── Badges ────────────────────────────────────────────────────────────────────

function EstadoBadge({ estado }: { estado: RegistroAccesoEvento["estado"] }) {
  const map = {
    Autorizado: "bg-emerald-100 text-emerald-700 border-emerald-200 bg-emerald-500",
    Denegado:   "bg-red-100 text-red-600 border-red-200 bg-red-500",
    Especial:   "bg-amber-100 text-amber-700 border-amber-200 bg-amber-500",
  };
  const dotColor = { Autorizado: "bg-emerald-500", Denegado: "bg-red-500", Especial: "bg-amber-500" }[estado];
  const base = { Autorizado: "bg-emerald-100 text-emerald-700 border-emerald-200", Denegado: "bg-red-100 text-red-600 border-red-200", Especial: "bg-amber-100 text-amber-700 border-amber-200" }[estado];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${base}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      {estado}
    </span>
  );
}

function ModalidadIcon({ modalidad }: { modalidad: string }) {
  if (modalidad === "QR") return (
    <span title="QR" className="inline-flex items-center gap-1 text-xs text-slate-500">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" />
      </svg>
      QR
    </span>
  );
  if (modalidad === "Biometrico") return (
    <span title="Biométrico" className="inline-flex items-center gap-1 text-xs text-slate-500">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
      </svg>
      Biométrico
    </span>
  );
  return <span className="text-xs text-slate-500">{modalidad}</span>;
}

// ── Photo Lightbox ────────────────────────────────────────────────────────────

function Lightbox({ src, nombre, onClose }: { src: string; nombre: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-lg w-full flex flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={nombre}
          className="w-full max-h-[70vh] object-contain rounded-2xl shadow-2xl"
        />
        <p className="text-white/80 text-sm font-medium">{nombre}</p>
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg text-slate-700 hover:text-slate-900 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Side Panel ────────────────────────────────────────────────────────────────

function SidePanel({
  evento,
  onClose,
}: {
  evento: RegistroAccesoEvento;
  onClose: () => void;
}) {
  const [lightbox, setLightbox] = useState(false);
  const ini = iniciales(evento.nombre);
  const tieneAccesoEspecial = evento.tipo_acceso === "Especial";
  const fotoUrl = evento.foto_referencia || evento.foto_visitante || null;

  return (
    <div className="flex flex-col h-full">
      {lightbox && fotoUrl && (
        <Lightbox src={fotoUrl} nombre={evento.nombre} onClose={() => setLightbox(false)} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-800">Detalle del evento</h3>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">
        {/* Photo + Identity */}
        <div className="flex flex-col items-center text-center gap-3">
          {fotoUrl ? (
            <button
              onClick={() => setLightbox(true)}
              className="relative group focus:outline-none"
              title="Ampliar foto"
            >
              <img
                src={fotoUrl}
                alt={evento.nombre}
                className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md transition-transform duration-200 group-hover:scale-105"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).parentElement!.style.display = "none";
                  (e.currentTarget.parentElement!.nextSibling as HTMLElement).style.display = "flex";
                }}
              />
              <span className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/25 transition-colors duration-200 flex items-center justify-center">
                <svg className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 drop-shadow" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607ZM10.5 7.5v6m3-3h-6" />
                </svg>
              </span>
            </button>
          ) : null}
          <div
            className={`w-24 h-24 rounded-full bg-blue-100 items-center justify-center text-2xl font-bold text-blue-700 border-4 border-white shadow-md ${fotoUrl ? "hidden" : "flex"}`}
          >
            {ini}
          </div>
          <div>
            <p className="font-bold text-slate-800 text-base leading-tight">{evento.nombre}</p>
            {evento.codigo_institucional !== "—" && (
              <p className="text-xs text-slate-400 mt-0.5">CC / Cód. {evento.codigo_institucional}</p>
            )}
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className="text-xs bg-slate-100 text-slate-600 font-medium px-2 py-0.5 rounded-full">
                {evento.tipo}
              </span>
              {tieneAccesoEspecial && (
                <span className="text-xs bg-purple-100 text-purple-700 font-medium px-2 py-0.5 rounded-full">
                  Acceso especial
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Estado */}
        <div className="flex justify-center">
          <EstadoBadge estado={evento.estado} />
        </div>

        {/* Details grid */}
        <div className="bg-slate-50 rounded-xl p-4 grid grid-cols-2 gap-x-4 gap-y-4">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Modalidad</p>
            <ModalidadIcon modalidad={evento.modalidad} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Portería</p>
            <p className="text-xs text-slate-700 font-medium">{evento.porteria}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Hora</p>
            <p className="text-xs font-mono text-slate-700">{evento.hora}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Tipo acceso</p>
            <p className="text-xs text-slate-700 font-medium">{evento.tipo_acceso}</p>
          </div>
          {evento.created_at && (
            <div className="col-span-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Fecha y hora completa</p>
              <p className="text-xs text-slate-700">{formatFechaCompleta(evento.created_at)}</p>
            </div>
          )}
        </div>

        {/* Observation */}
        {evento.observacion && (
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Observación</p>
            <div className="bg-slate-50 rounded-xl px-4 py-3">
              <p className="text-xs text-slate-600 leading-relaxed">{evento.observacion}</p>
            </div>
          </div>
        )}

        {/* Validated by jefe */}
        {evento.id_jefe_validador && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
            </svg>
            <p className="text-xs text-blue-700 font-medium">Validado por el jefe de seguridad</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Periodo = "Hoy" | "Semana" | "Mes";
type FiltroEstado = "todos" | "autorizados" | "denegados" | "especial";

export default function RegistroEventosPage() {
  const [periodo, setPeriodo] = useState<Periodo>("Hoy");
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todos");
  const [eventos, setEventos] = useState<RegistroAccesoEvento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RegistroAccesoEvento | null>(null);

  const cargar = useCallback(async (p: Periodo, e: FiltroEstado) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRegistroAccesos(p, e);
      setEventos(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al cargar eventos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(periodo, filtroEstado); }, [periodo, filtroEstado, cargar]);

  const estadoTabs: { key: FiltroEstado; label: string }[] = [
    { key: "todos",       label: "Todos" },
    { key: "autorizados", label: "Autorizados" },
    { key: "denegados",   label: "Denegados" },
    { key: "especial",    label: "Especial" },
  ];

  return (
    <div className="flex gap-5 h-full">
      {/* ── Main content ── */}
      <div className={`flex-1 min-w-0 flex flex-col gap-5 transition-all duration-300 ${selected ? "lg:max-w-[calc(100%-22rem)]" : ""}`}>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Registro de eventos</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Historial completo de accesos — {eventos.length} registro{eventos.length !== 1 ? "s" : ""}
            </p>
          </div>
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value as Periodo)}
            className="border border-slate-200 bg-white text-slate-700 text-sm rounded-xl px-3 py-2 shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none w-fit"
          >
            {(["Hoy", "Semana", "Mes"] as Periodo[]).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {/* Estado tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
          {estadoTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setFiltroEstado(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                filtroEstado === t.key
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-9 h-9 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-16 px-6">
              <p className="text-sm text-red-500 mb-3">{error}</p>
              <button onClick={() => cargar(periodo, filtroEstado)} className="text-xs text-blue-600 font-semibold hover:underline">
                Reintentar
              </button>
            </div>
          ) : eventos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-600">Sin eventos para este periodo</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {["PERSONA", "TIPO", "MODALIDAD", "PORTERÍA", "HORA", "ESTADO"].map((col) => (
                      <th key={col} className="text-left text-[10px] font-bold text-slate-400 tracking-wider px-5 py-3 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {eventos.map((ev) => (
                    <tr
                      key={ev.id}
                      onClick={() => setSelected(selected?.id === ev.id ? null : ev)}
                      className={`transition-colors cursor-pointer ${
                        selected?.id === ev.id
                          ? "bg-blue-50"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="px-5 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          {(ev.foto_referencia || ev.foto_visitante) ? (
                            <img
                              src={(ev.foto_referencia || ev.foto_visitante)!}
                              alt={ev.nombre}
                              className="w-8 h-8 rounded-full object-cover shrink-0"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = "none";
                                (e.currentTarget.nextSibling as HTMLElement).style.display = "flex";
                              }}
                            />
                          ) : null}
                          <div
                            className={`w-8 h-8 bg-blue-100 rounded-full items-center justify-center text-xs font-bold text-blue-700 shrink-0 ${(ev.foto_referencia || ev.foto_visitante) ? "hidden" : "flex"}`}
                          >
                            {iniciales(ev.nombre)}
                          </div>
                          <p className="font-semibold text-slate-800 leading-tight">{ev.nombre}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-500 whitespace-nowrap text-xs">{ev.tipo}</td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <ModalidadIcon modalidad={ev.modalidad} />
                      </td>
                      <td className="px-5 py-3 text-slate-500 whitespace-nowrap text-xs">{ev.porteria}</td>
                      <td className="px-5 py-3 font-mono text-slate-600 whitespace-nowrap text-xs">{ev.hora}</td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <EstadoBadge estado={ev.estado} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Side panel ── */}
      {selected && (
        <aside className="hidden lg:flex flex-col w-80 shrink-0 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden self-start sticky top-6">
          <SidePanel evento={selected} onClose={() => setSelected(null)} />
        </aside>
      )}

      {/* Mobile full-screen drawer */}
      {selected && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelected(null)} />
          <div className="relative w-full bg-white rounded-t-2xl max-h-[85vh] overflow-hidden flex flex-col z-10">
            <SidePanel evento={selected} onClose={() => setSelected(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
