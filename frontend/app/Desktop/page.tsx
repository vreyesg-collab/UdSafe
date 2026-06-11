"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getJefeDashboardStats, crearAlerta } from "../../lib/api";
import type { DashboardStatsResponse } from "../../lib/types";
import { exportarPDFRapido } from "../../lib/reportes";
// ─── Types ───────────────────────────────────────────────────────────────────
type AccessEvent = {
  persona: string;
  tipo: string;
  metodo: string;
  porteria: string;
  hora: string;
  estado: "Autorizado" | "Denegado" | "Especial";
};
type UserType = { label: string; count: number; pct: number; color: string };

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ estado }: { estado: AccessEvent["estado"] }) {
  const styles = {
    Autorizado: "bg-emerald-100 text-emerald-700 border border-emerald-200",
    Denegado: "bg-red-100 text-red-600 border border-red-200",
    Especial: "bg-amber-100 text-amber-700 border border-amber-200",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[estado]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${estado === "Autorizado" ? "bg-emerald-500" : estado === "Denegado" ? "bg-red-500" : "bg-amber-500"}`} />
      {estado}
    </span>
  );
}

function StatCard({
  title,
  value,
  sub,
  subColor = "text-slate-500",
  icon,
  iconBg,
}: {
  title: string;
  value: string | number;
  sub: string;
  subColor?: string;
  icon: React.ReactNode;
  iconBg: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <span className="text-sm font-medium text-slate-500">{title}</span>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>{icon}</div>
      </div>
      <div>
        <p className="text-3xl font-bold text-slate-800 tracking-tight">{value}</p>
        <p className={`text-xs mt-1 font-medium ${subColor}`}>{sub}</p>
      </div>
    </div>
  );
}

// Donut chart via SVG
function DonutChart({ data, total, size = 140 }: { data: UserType[]; total: number; size?: number }) {
  const r = size * 0.386;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  const segments = data.map((d) => {
    const dash = (d.pct / 100) * circumference;
    const gap = circumference - dash;
    const segment = { ...d, dash, gap, offset };
    offset += dash;
    return segment;
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth="18" />
      {segments.map((s, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={s.color}
          strokeWidth="18"
          strokeDasharray={`${s.dash} ${s.gap}`}
          strokeDashoffset={-s.offset + circumference * 0.25}
          strokeLinecap="butt"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      ))}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize={size * 0.13} fontWeight="700" fill="#1e293b">
        {total.toLocaleString()}
      </text>
      <text x={cx} y={cy + size * 0.1} textAnchor="middle" fontSize={size * 0.065} fill="#94a3b8">
        accesos
      </text>
    </svg>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function UDSafeDashboard() {
  const router = useRouter();
  const [period, setPeriod] = useState("Hoy");
  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal emisión de alerta
  const [modalAlerta, setModalAlerta] = useState(false);
  const [tipoAlerta, setTipoAlerta] = useState<string | null>(null);
  const [obsAlerta, setObsAlerta] = useState("");
  const [enviandoAlerta, setEnviandoAlerta] = useState(false);
  const [errorAlerta, setErrorAlerta] = useState<string | null>(null);
  const [alertaEnviada, setAlertaEnviada] = useState(false);

  const TIPOS_ALERTA = ["Persona sospechosa", "Pelea o agresión", "Robo o hurto", "Acceso no autorizado", "Daño a instalaciones", "Otro"];

  async function handleEmitirAlerta() {
    if (!tipoAlerta) return;
    setEnviandoAlerta(true);
    setErrorAlerta(null);
    try {
      await crearAlerta({ asunto: tipoAlerta, descripcion: obsAlerta.trim() || tipoAlerta });
      setAlertaEnviada(true);
    } catch (err: any) {
      setErrorAlerta(err?.message ?? "No se pudo emitir la alerta.");
    } finally {
      setEnviandoAlerta(false);
    }
  }

  function cerrarModal() {
    setModalAlerta(false);
    setTipoAlerta(null);
    setObsAlerta("");
    setErrorAlerta(null);
    setAlertaEnviada(false);
  }

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const data = await getJefeDashboardStats(period);
      setStats(data);
    } catch (err: any) {
      setError(err?.message || "Ocurrió un error al cargar las métricas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [period]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <div className="w-10 h-10 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin"></div>
        <p className="text-sm font-semibold text-slate-500">Cargando métricas en tiempo real...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center max-w-lg mx-auto mt-12">
        <svg className="w-10 h-10 text-red-500 mx-auto mb-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <h3 className="text-base font-bold text-slate-800 mb-1">Error al cargar estadísticas</h3>
        <p className="text-sm text-slate-500 mb-4">{error}</p>
        <button
          onClick={fetchData}
          className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const total = stats?.total_accesos ?? 0;
  const autorizados = stats?.autorizados ?? 0;
  const denegados = stats?.denegados ?? 0;
  const anomalias = stats?.anomalias_activas ?? 0;

  const tasaAprobacion = total > 0 ? `${((autorizados / total) * 100).toFixed(1)}% tasa de aprobación` : "0% tasa de aprobación";
  const tasaRechazo = total > 0 ? `${((denegados / total) * 100).toFixed(1)}% tasa de rechazo` : "0% tasa de rechazo";

  const hourlyData = stats?.hourly_flow || [];
  const maxValue = Math.max(...hourlyData.map((d) => d.value), 1);
  const userTypes = stats?.user_types || [];
  const events = stats?.events || [];

  return (
    <>
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Métricas de acceso</h1>
          <p className="text-sm text-slate-500 mt-0.5">Sede Piedra de Bolívar · actualizado hace un momento</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="border border-slate-200 bg-white text-slate-700 text-sm rounded-xl px-3 py-2 shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            {["Hoy", "Semana", "Mes"].map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <button
            onClick={() => setModalAlerta(true)}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <span className="hidden sm:inline">Emitir alerta</span>
            <span className="sm:hidden">Alerta</span>
          </button>
          <button
            onClick={() => stats && exportarPDFRapido(stats, period)}
            disabled={!stats}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span className="hidden sm:inline">Exportar reporte</span>
            <span className="sm:hidden">Exportar</span>
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total de accesos"
          value={total.toLocaleString()}
          sub={`Total en el periodo (${period})`}
          subColor="text-blue-600"
          iconBg="bg-blue-50"
          icon={
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          }
        />
        <StatCard
          title="Autorizados"
          value={autorizados.toLocaleString()}
          sub={tasaAprobacion}
          subColor="text-emerald-600"
          iconBg="bg-emerald-50"
          icon={
            <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          }
        />
        <StatCard
          title="Denegados"
          value={denegados.toLocaleString()}
          sub={tasaRechazo}
          subColor="text-red-600"
          iconBg="bg-red-50"
          icon={
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          }
        />
        <StatCard
          title="Anomalías activas"
          value={anomalias}
          sub="Pendientes de revisión"
          subColor="text-amber-600"
          iconBg="bg-amber-50"
          icon={
            <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
        {/* Hourly bar chart */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-bold text-slate-700">Flujo de accesos por hora</h2>
            <span className="text-xs text-slate-400 font-medium">Hoy</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {hourlyData.length > 0 ? (
              hourlyData.map((d) => (
                <div key={d.hour} className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 font-mono w-7 text-right shrink-0">{d.hour}</span>
                  <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-700"
                      style={{ width: `${(d.value / maxValue) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-600 font-semibold w-7 text-right shrink-0">{d.value}</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 text-center py-6">Sin datos de flujo para hoy</p>
            )}
          </div>
        </div>

        {/* Donut chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-700">Distribución por tipo de usuario</h2>
            <span className="text-xs text-slate-400 font-medium">{period}</span>
          </div>
          <div className="flex flex-col items-center gap-4">
            <DonutChart data={userTypes} total={total} size={160} />
            <div className="flex flex-col gap-2 w-full">
              {userTypes.map((u) => (
                <div key={u.label} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: u.color }} />
                    <span className="text-xs text-slate-600 font-medium">{u.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800">{u.count}</span>
                    <span className="text-xs text-slate-400 w-6 text-right">{u.pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Events table */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-700">Últimos eventos registrados</h2>
            <button
              onClick={() => router.push("/Desktop/Registro_eventos")}
              className="text-xs text-blue-600 hover:text-blue-800 font-semibold transition-colors"
            >
              Ver todos →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["PERSONA", "TIPO", "MÉTODO", "PORTERÍA", "HORA", "ESTADO"].map((col) => (
                    <th
                      key={col}
                      className="text-left text-[10px] font-bold text-slate-400 tracking-wider px-5 py-3 whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {events.length > 0 ? (
                  events.map((ev, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 font-semibold text-slate-800 whitespace-nowrap">{ev.persona}</td>
                      <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{ev.tipo}</td>
                      <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{ev.metodo}</td>
                      <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{ev.porteria}</td>
                      <td className="px-5 py-3 font-mono text-slate-600 whitespace-nowrap">{ev.hora}</td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <StatusBadge estado={ev.estado} />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center text-xs text-slate-400 py-6">
                      No hay eventos registrados en este periodo
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Reports */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-700 mb-4">Reportes disponibles</h2>
          <div className="flex flex-col gap-3">
            {[
              {
                title: "Reporte diario",
                sub: "Resumen de accesos · PDF / Excel",
                icon: (
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                ),
                iconBg: "bg-blue-50",
              },
              {
                title: "Reporte semanal",
                sub: "Tendencias y comparativo · PDF",
                icon: (
                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                ),
                iconBg: "bg-emerald-50",
              },
              {
                title: "Reporte de anomalías",
                sub: "Incidentes del periodo · PDF",
                icon: (
                  <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                ),
                iconBg: "bg-amber-50",
              },
            ].map((r) => (
              <div
                key={r.title}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer group border border-transparent hover:border-slate-200"
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${r.iconBg}`}>
                  {r.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700 leading-tight">{r.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{r.sub}</p>
                </div>
                <button
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors shrink-0"
                  aria-label={`Descargar ${r.title}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Modal emisión de alerta */}
      {modalAlerta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">

            <div className="bg-red-600 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                <span className="font-bold text-base">Emitir alerta de seguridad</span>
              </div>
              <button onClick={cerrarModal} className="text-white/70 hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-5">
              {!alertaEnviada ? (
                <>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Tipo de anomalía</p>
                    <div className="flex flex-wrap gap-2">
                      {TIPOS_ALERTA.map((t) => (
                        <button
                          key={t}
                          onClick={() => setTipoAlerta(t)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all
                            ${tipoAlerta === t
                              ? "bg-red-600 border-red-600 text-white"
                              : "bg-white border-slate-200 text-slate-700 hover:border-red-300"
                            }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Detalles (opcional)</p>
                    <textarea
                      value={obsAlerta}
                      onChange={(e) => setObsAlerta(e.target.value)}
                      placeholder="Ubicación, personas involucradas, descripción de la situación..."
                      rows={3}
                      className="w-full border border-slate-200 focus:border-red-400 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-colors resize-none"
                    />
                  </div>

                  {errorAlerta && (
                    <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errorAlerta}</p>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button onClick={cerrarModal} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition-all active:scale-95">
                      Cancelar
                    </button>
                    <button
                      onClick={handleEmitirAlerta}
                      disabled={!tipoAlerta || enviandoAlerta}
                      className="flex-[2] flex items-center justify-center gap-2 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold text-sm rounded-xl transition-all active:scale-95"
                    >
                      {enviandoAlerta ? <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Enviar alerta"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center space-y-4 py-2">
                  <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-7 h-7 text-red-600">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">Alerta enviada</p>
                    <p className="text-sm text-slate-500 mt-1">Todos los vigilantes activos han sido notificados sobre <span className="font-semibold text-slate-700">"{tipoAlerta}"</span>.</p>
                  </div>
                  <button onClick={cerrarModal} className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-xl transition-all active:scale-95">
                    Cerrar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}