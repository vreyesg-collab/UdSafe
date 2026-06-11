"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cargarSesion, getAlertas, resolverAlerta, crearAlerta } from "../../../lib/api";
import { type AlertaResponse } from "../../../lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatRelativo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "hace un momento";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return formatFecha(iso);
}

const TIPOS_ALERTA = [
  "Persona sospechosa",
  "Pelea o agresión",
  "Robo o hurto",
  "Acceso no autorizado",
  "Daño a instalaciones",
  "Otro",
];

type Periodo = "Hoy" | "Semana" | "Mes" | "Fecha";
type EstadoFiltro = "todos" | "Activa" | "Resuelta";

// ── Componente ────────────────────────────────────────────────────────────────

export default function AlertasPage() {
  const router = useRouter();

  const [alertas, setAlertas] = useState<AlertaResponse[]>([]);
  const [cargando, setCargando] = useState(true);
  const [resolviendo, setResolviendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [periodo, setPeriodo] = useState<Periodo>("Hoy");
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>("todos");
  const [fechaEspecifica, setFechaEspecifica] = useState("");

  // Estado del formulario de emisión
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [tipoSeleccionado, setTipoSeleccionado] = useState<string | null>(null);
  const [observaciones, setObservaciones] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorEmision, setErrorEmision] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const params: Parameters<typeof getAlertas>[0] = { estado: estadoFiltro };
      if (periodo === "Fecha" && fechaEspecifica) {
        params.fecha = fechaEspecifica;
      } else if (periodo !== "Fecha") {
        params.periodo = periodo;
      }
      setAlertas(await getAlertas(params));
    } catch (err: any) {
      setError(err?.message ?? "Error al cargar las alertas.");
    } finally {
      setCargando(false);
    }
  }, [periodo, estadoFiltro, fechaEspecifica]);

  useEffect(() => {
    const s = cargarSesion();
    if (!s || s.rol !== "jefe_seguridad") {
      router.push("/login");
      return;
    }
    cargar();
  }, [cargar, router]);

  async function handleResolver(id: string) {
    setResolviendo(id);
    try {
      await resolverAlerta(id);
      setAlertas((prev) => prev.map((a) => (a.id === id ? { ...a, estado: "Resuelta" } : a)));
      // Notifica al layout para que detenga el sonido de inmediato
      window.dispatchEvent(new CustomEvent("udsafe:alertaResuelta"));
    } catch (err: any) {
      setError(err?.message ?? "No se pudo resolver la alerta.");
    } finally {
      setResolviendo(null);
    }
  }

  async function handleEmitir() {
    if (!tipoSeleccionado) return;
    setEnviando(true);
    setErrorEmision(null);
    try {
      await crearAlerta({
        asunto: tipoSeleccionado,
        descripcion: observaciones.trim() || tipoSeleccionado,
      });
      setPanelAbierto(false);
      setTipoSeleccionado(null);
      setObservaciones("");
      cargar();
    } catch (err: any) {
      setErrorEmision(err?.message ?? "No se pudo emitir la alerta.");
    } finally {
      setEnviando(false);
    }
  }

  const activas = alertas.filter((a) => a.estado === "Activa");
  const historial = alertas.filter((a) => a.estado !== "Activa");
  const periodoLabels: Periodo[] = ["Hoy", "Semana", "Mes", "Fecha"];

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Título + botón emitir */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Anomalías y Alertas</h1>
          <p className="text-sm text-slate-500 mt-0.5">Alertas de seguridad emitidas por vigilantes y jefatura</p>
        </div>
        <button
          onClick={() => { setPanelAbierto((v) => !v); setErrorEmision(null); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95
            ${panelAbierto
              ? "bg-slate-200 text-slate-700"
              : "bg-red-600 hover:bg-red-700 text-white shadow-sm"
            }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          {panelAbierto ? "Cancelar" : "Emitir alerta"}
        </button>
      </div>

      {/* Panel de emisión */}
      {panelAbierto && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 space-y-4">
          <p className="text-sm font-bold text-red-800">Nueva alerta de seguridad</p>

          <div>
            <p className="text-xs font-semibold text-red-700 mb-2 uppercase tracking-wide">Tipo de anomalía</p>
            <div className="flex flex-wrap gap-2">
              {TIPOS_ALERTA.map((t) => (
                <button
                  key={t}
                  onClick={() => setTipoSeleccionado(t)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all
                    ${tipoSeleccionado === t
                      ? "bg-red-600 border-red-600 text-white"
                      : "bg-white border-red-200 text-red-700 hover:border-red-400"
                    }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-red-700 mb-2 uppercase tracking-wide">Detalles adicionales (opcional)</p>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Describe la situación: ubicación, personas involucradas..."
              rows={3}
              className="w-full bg-white border border-red-200 focus:border-red-400 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-colors resize-none"
            />
          </div>

          {errorEmision && (
            <p className="text-xs text-red-700 bg-red-100 border border-red-200 rounded-xl px-3 py-2">{errorEmision}</p>
          )}

          <button
            onClick={handleEmitir}
            disabled={!tipoSeleccionado || enviando}
            className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold text-sm rounded-xl transition-all active:scale-95"
          >
            {enviando ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
              </svg>
            )}
            Enviar alerta
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
          {periodoLabels.map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                ${periodo === p ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {p === "Fecha" ? "Día específico" : p}
            </button>
          ))}
        </div>

        {periodo === "Fecha" && (
          <input
            type="date"
            value={fechaEspecifica}
            onChange={(e) => setFechaEspecifica(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-400 transition-colors"
          />
        )}

        <div className="ml-auto flex gap-1.5">
          {(["todos", "Activa", "Resuelta"] as EstadoFiltro[]).map((e) => (
            <button
              key={e}
              onClick={() => setEstadoFiltro(e)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all
                ${estadoFiltro === e
                  ? e === "Activa"
                    ? "bg-red-50 border-red-200 text-red-700"
                    : e === "Resuelta"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : "bg-slate-800 border-slate-800 text-white"
                  : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
            >
              {e === "todos" ? "Todas" : e}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <span>⚠️</span> {error}
        </div>
      )}

      {cargando ? (
        <div className="flex items-center justify-center py-20">
          <span className="inline-block w-8 h-8 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">

          {(estadoFiltro === "todos" || estadoFiltro === "Activa") && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                  Alertas activas
                  {activas.length > 0 && (
                    <span className="ml-2 bg-red-500 text-white text-[10px] font-bold rounded-full px-2 py-0.5">
                      {activas.length}
                    </span>
                  )}
                </h2>
              </div>
              {activas.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
                  <p className="text-slate-400 text-sm">No hay alertas activas en este período</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activas.map((a) => (
                    <AlertaCard key={a.id} alerta={a} resolviendo={resolviendo === a.id} onResolver={() => handleResolver(a.id)} />
                  ))}
                </div>
              )}
            </section>
          )}

          {(estadoFiltro === "todos" || estadoFiltro === "Resuelta") && (
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide">
                Historial resuelto
                {historial.length > 0 && <span className="ml-2 text-slate-400 font-normal normal-case tracking-normal">({historial.length})</span>}
              </h2>
              {historial.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
                  <p className="text-slate-400 text-sm">No hay alertas resueltas en este período</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {historial.map((a) => <AlertaCard key={a.id} alerta={a} />)}
                </div>
              )}
            </section>
          )}

        </div>
      )}
    </div>
  );
}

// ── Tarjeta de alerta ─────────────────────────────────────────────────────────

function AlertaCard({
  alerta,
  resolviendo,
  onResolver,
}: {
  alerta: AlertaResponse;
  resolviendo?: boolean;
  onResolver?: () => void;
}) {
  const activa = alerta.estado === "Activa";

  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-5 flex items-start gap-4 transition-all
      ${activa ? "border-red-200 bg-red-50/30" : "border-slate-100"}`}
    >
      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5
        ${activa ? "bg-red-100" : "bg-slate-100"}`}
      >
        {activa ? (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-5 h-5 text-red-600">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5 text-slate-400">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <p className={`font-bold text-sm ${activa ? "text-red-800" : "text-slate-700"}`}>{alerta.asunto}</p>
            {alerta.nombre_emisor && (
              <p className="text-xs text-slate-500 mt-0.5">
                Por <span className="font-semibold text-slate-600">{alerta.nombre_emisor}</span>
              </p>
            )}
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0
            ${activa ? "bg-red-100 text-red-700 border border-red-200" : "bg-slate-100 text-slate-500 border border-slate-200"}`}
          >
            {alerta.estado}
          </span>
        </div>

        {alerta.observaciones && alerta.observaciones !== alerta.asunto && (
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">{alerta.observaciones}</p>
        )}

        <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
          <p className="text-[11px] text-slate-400">{formatRelativo(alerta.fecha_hora)}</p>
          {activa && onResolver && (
            <button
              onClick={onResolver}
              disabled={resolviendo}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all active:scale-95"
            >
              {resolviendo ? (
                <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              )}
              Marcar como resuelta
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
