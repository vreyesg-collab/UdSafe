"use client";

import { useState, useEffect, useMemo } from "react";
import { getRegistroAccesos } from "../../../lib/api";
import type { RegistroAccesoEvento } from "../../../lib/types";
import { exportarPDFDetallado, exportarCSV } from "../../../lib/reportes";

const TIPOS = ["Estudiante", "Docente", "Administrativo", "Visitante", "Servicios generales"];
const MODALIDADES = ["QR", "Biometrico", "Manual", "Especial"];
const PERIODOS = ["Hoy", "Semana", "Mes"];
const ESTADOS = [
  { value: "todos", label: "Todos" },
  { value: "Autorizado", label: "Autorizados" },
  { value: "Denegado", label: "Denegados" },
  { value: "Especial", label: "Especiales" },
];
const FORMATOS = [
  { id: "pdf", label: "PDF", desc: "Abre en el diálogo de impresión" },
  { id: "csv", label: "CSV / Excel", desc: "Descarga un archivo .csv compatible con Excel" },
];

function Badge({ estado }: { estado: string }) {
  const s: Record<string, string> = {
    Autorizado: "bg-emerald-100 text-emerald-700",
    Denegado: "bg-red-100 text-red-600",
    Especial: "bg-amber-100 text-amber-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${s[estado] ?? "bg-slate-100 text-slate-600"}`}>
      {estado}
    </span>
  );
}

export default function ReportesPage() {
  const [periodo, setPeriodo] = useState("Hoy");
  const [estadoFiltro, setEstadoFiltro] = useState("todos");
  const [tiposSelec, setTiposSelec] = useState<string[]>([]);
  const [modalidadesSelec, setModalidadesSelec] = useState<string[]>([]);
  const [formato, setFormato] = useState("pdf");
  const [eventos, setEventos] = useState<RegistroAccesoEvento[]>([]);
  const [cargando, setCargando] = useState(false);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    const cargar = async () => {
      setCargando(true);
      try {
        const data = await getRegistroAccesos(periodo, estadoFiltro === "todos" ? "todos" : estadoFiltro);
        setEventos(data);
      } catch {
        setEventos([]);
      } finally {
        setCargando(false);
      }
    };
    cargar();
  }, [periodo, estadoFiltro]);

  const eventosFiltrados = useMemo(() => {
    return eventos.filter(ev => {
      const pasaTipo = tiposSelec.length === 0 || tiposSelec.some(t => ev.tipo.toLowerCase().includes(t.toLowerCase()));
      const pasaModal = modalidadesSelec.length === 0 || modalidadesSelec.includes(ev.modalidad);
      const pasaEstado = estadoFiltro === "todos" || ev.estado === estadoFiltro;
      return pasaTipo && pasaModal && pasaEstado;
    });
  }, [eventos, tiposSelec, modalidadesSelec, estadoFiltro]);

  function toggleTipo(t: string) {
    setTiposSelec(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }
  function toggleModalidad(m: string) {
    setModalidadesSelec(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  }

  async function handleExportar() {
    setExportando(true);
    const filtros = { periodo, tipos: tiposSelec, modalidades: modalidadesSelec, estado: estadoFiltro };
    const ts = new Date().toISOString().slice(0, 10);
    if (formato === "pdf") {
      exportarPDFDetallado(eventosFiltrados, filtros);
    } else {
      exportarCSV(eventosFiltrados, `reporte_udsafe_${ts}.csv`);
    }
    setTimeout(() => setExportando(false), 800);
  }

  const total = eventosFiltrados.length;
  const autorizados = eventosFiltrados.filter(e => e.estado === "Autorizado").length;
  const denegados = eventosFiltrados.filter(e => e.estado === "Denegado").length;
  const especiales = eventosFiltrados.filter(e => e.estado === "Especial").length;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">Generador de reportes</h1>
        <p className="text-sm text-slate-500 mt-0.5">Filtra y exporta los accesos en el formato que necesites</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* ── Panel de filtros ── */}
        <div className="lg:col-span-1 flex flex-col gap-4">

          {/* Periodo */}
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Periodo</p>
            <div className="flex flex-col gap-1.5">
              {PERIODOS.map(p => (
                <button
                  key={p}
                  onClick={() => setPeriodo(p)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-all
                    ${periodo === p ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Estado */}
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Estado</p>
            <div className="flex flex-col gap-1.5">
              {ESTADOS.map(e => (
                <button
                  key={e.value}
                  onClick={() => setEstadoFiltro(e.value)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-all
                    ${estadoFiltro === e.value ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tipos */}
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Tipo de usuario</p>
            <div className="flex flex-col gap-2">
              {TIPOS.map(t => (
                <label key={t} className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={tiposSelec.includes(t)}
                    onChange={() => toggleTipo(t)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 accent-blue-600"
                  />
                  <span className="text-sm text-slate-600 group-hover:text-slate-800">{t}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Modalidades */}
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Modalidad</p>
            <div className="flex flex-col gap-2">
              {MODALIDADES.map(m => (
                <label key={m} className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={modalidadesSelec.includes(m)}
                    onChange={() => toggleModalidad(m)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 accent-blue-600"
                  />
                  <span className="text-sm text-slate-600 group-hover:text-slate-800">{m}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Formato + Exportar */}
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Formato</p>
            <div className="flex flex-col gap-2 mb-4">
              {FORMATOS.map(f => (
                <label key={f.id} className={`flex items-start gap-3 p-2.5 rounded-xl cursor-pointer border transition-all
                  ${formato === f.id ? "border-blue-300 bg-blue-50" : "border-transparent hover:bg-slate-50"}`}>
                  <input
                    type="radio"
                    name="formato"
                    value={f.id}
                    checked={formato === f.id}
                    onChange={() => setFormato(f.id)}
                    className="mt-0.5 accent-blue-600"
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{f.label}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{f.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            <button
              onClick={handleExportar}
              disabled={exportando || total === 0}
              className="w-full bg-slate-900 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {exportando ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              )}
              Exportar {total > 0 ? `(${total})` : ""}
            </button>
          </div>
        </div>

        {/* ── Vista previa ── */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          {/* Stats summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total", value: total, color: "text-slate-800" },
              { label: "Autorizados", value: autorizados, color: "text-emerald-600" },
              { label: "Denegados", value: denegados, color: "text-red-600" },
              { label: "Especiales", value: especiales, color: "text-amber-600" },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{s.label}</p>
                <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Table preview */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex-1">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-700">Vista previa</h2>
              <span className="text-xs text-slate-400">{periodo} · {eventosFiltrados.length} eventos</span>
            </div>

            {cargando ? (
              <div className="flex items-center justify-center py-16 gap-3">
                <div className="w-6 h-6 border-3 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-sm text-slate-400">Cargando...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {["Nombre", "Tipo", "Código", "Modalidad", "Portería", "Hora", "Estado"].map(col => (
                        <th key={col} className="text-left text-[10px] font-bold text-slate-400 tracking-wider px-4 py-3 whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {eventosFiltrados.length > 0 ? (
                      eventosFiltrados.slice(0, 100).map((ev) => (
                        <tr key={ev.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-2.5 font-medium text-slate-800 whitespace-nowrap">{ev.nombre}</td>
                          <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{ev.tipo}</td>
                          <td className="px-4 py-2.5 font-mono text-slate-500 whitespace-nowrap text-xs">{ev.codigo_institucional}</td>
                          <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{ev.modalidad}</td>
                          <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{ev.porteria}</td>
                          <td className="px-4 py-2.5 font-mono text-slate-600 whitespace-nowrap text-xs">{ev.hora}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap"><Badge estado={ev.estado} /></td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="text-center text-xs text-slate-400 py-12">
                          Sin eventos con los filtros seleccionados
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {eventosFiltrados.length > 100 && (
                  <p className="text-center text-xs text-slate-400 py-3 border-t border-slate-100">
                    Mostrando 100 de {eventosFiltrados.length} — el reporte incluye todos los eventos
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
