"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSolicitudesEspeciales } from "../../../lib/api";
import type { SolicitudEspecial } from "../../../lib/types";

type Filtro = "pendiente" | "aprobada" | "denegada";

const VIGENCIA_LABELS: Record<string, string> = {
  solo_hoy: "Sólo hoy",
  esta_semana: "Esta semana",
  permanente: "Permanente",
};

function EstadoBadge({ estado }: { estado: string }) {
  if (estado === "pendiente") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        Pendiente
      </span>
    );
  }
  if (estado === "aprobada") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Aprobada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-600 border border-red-200">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
      Denegada
    </span>
  );
}

function formatFecha(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", timeZone: "America/Bogota" }) +
    " · " +
    d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "America/Bogota" });
}

function iniciales(nombre: string) {
  return nombre.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

export default function EspecialesListPage() {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("pendiente");
  const [solicitudes, setSolicitudes] = useState<SolicitudEspecial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function cargar(f: Filtro) {
    setLoading(true);
    setError(null);
    try {
      const data = await getSolicitudesEspeciales(f);
      setSolicitudes(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al cargar las solicitudes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(filtro); }, [filtro]);

  // Auto-refresh every 15s when viewing pending
  useEffect(() => {
    if (filtro !== "pendiente") return;
    const t = setInterval(() => cargar("pendiente"), 15000);
    return () => clearInterval(t);
  }, [filtro]);

  const tabs: { key: Filtro; label: string }[] = [
    { key: "pendiente", label: "Pendientes" },
    { key: "aprobada", label: "Aprobadas" },
    { key: "denegada", label: "Denegadas" },
  ];

  const pendingCount = filtro === "pendiente" ? solicitudes.length : 0;

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Accesos especiales</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Solicitudes de acceso para visitantes externos
          </p>
        </div>
        {filtro === "pendiente" && pendingCount > 0 && (
          <span className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold px-4 py-2 rounded-xl">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            {pendingCount} pendiente{pendingCount !== 1 ? "s" : ""} de resolución
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit mb-5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFiltro(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              filtro === t.key
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-16 px-6">
            <p className="text-sm text-red-500 mb-3">{error}</p>
            <button
              onClick={() => cargar(filtro)}
              className="text-xs text-blue-600 font-semibold hover:underline"
            >
              Reintentar
            </button>
          </div>
        ) : solicitudes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-slate-600">No hay solicitudes {filtro === "pendiente" ? "pendientes" : filtro === "aprobada" ? "aprobadas" : "denegadas"}</p>
            <p className="text-xs text-slate-400 mt-1">Las nuevas solicitudes aparecerán aquí automáticamente</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["#", "VISITANTE", "MOTIVO", "PORTERÍA", "VIGILANTE", "HORA", "ESTADO", ""].map((col) => (
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
                {solicitudes.map((s) => (
                  <tr
                    key={s.id}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => router.push(`/Desktop/Especiales/${s.id}`)}
                  >
                    <td className="px-5 py-3 text-slate-400 font-mono text-xs whitespace-nowrap">
                      #{String(s.numero ?? "—").padStart(3, "0")}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-xs font-bold text-blue-700 shrink-0">
                          {iniciales(s.nombre_visitante)}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 text-sm leading-tight">{s.nombre_visitante}</p>
                          <p className="text-xs text-slate-400">CC. {s.cedula_visitante}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-500 max-w-[180px]">
                      <p className="truncate text-xs">{s.motivo}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-500 whitespace-nowrap text-xs">{s.porteria}</td>
                    <td className="px-5 py-3 text-slate-500 whitespace-nowrap text-xs">
                      {s.nombre_vigilante || "—"}
                    </td>
                    <td className="px-5 py-3 font-mono text-slate-600 whitespace-nowrap text-xs">
                      {formatFecha(s.created_at)}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <EstadoBadge estado={s.estado} />
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {s.estado === "pendiente" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/Desktop/Especiales/${s.id}`);
                          }}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                        >
                          Revisar →
                        </button>
                      )}
                      {s.estado !== "pendiente" && s.vigencia && (
                        <span className="text-xs text-slate-400">
                          {VIGENCIA_LABELS[s.vigencia] ?? s.vigencia}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
