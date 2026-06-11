"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { getSolicitudEspecialDetalle, decidirSolicitudEspecial } from "../../../../lib/api";
import type { SolicitudEspecial, DecisionSolicitudRequest } from "../../../../lib/types";

const VIGENCIA_OPTIONS: { value: DecisionSolicitudRequest["vigencia"]; label: string }[] = [
  { value: "solo_hoy", label: "Sólo hoy" },
  { value: "esta_semana", label: "Esta semana" },
  { value: "permanente", label: "Permanente" },
];

const VIGENCIA_LABELS: Record<string, string> = {
  solo_hoy: "Sólo hoy",
  esta_semana: "Esta semana",
  permanente: "Permanente",
};

function iniciales(nombre: string) {
  return nombre.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

function formatFechaLarga(iso: string) {
  return new Date(iso).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Bogota",
  });
}

function formatFechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Bogota",
  });
}

function EstadoBadge({ estado }: { estado: string }) {
  if (estado === "pendiente") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        Pendiente
      </span>
    );
  }
  if (estado === "aprobada") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        Aprobada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-600 border border-red-200">
      <span className="w-2 h-2 rounded-full bg-red-500" />
      Denegada
    </span>
  );
}

function HistorialBadge({ estado }: { estado: string }) {
  if (estado === "aprobada") {
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Aprobado</span>;
  }
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">Denegado</span>;
}

export default function EspecialDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [solicitud, setSolicitud] = useState<SolicitudEspecial | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Decision form state
  const [vigencia, setVigencia] = useState<DecisionSolicitudRequest["vigencia"]>("solo_hoy");
  const [observacion, setObservacion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getSolicitudEspecialDetalle(id)
      .then((s) => setSolicitud(s))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error al cargar."))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleDecision(decision: "aprobada" | "denegada") {
    if (!id) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: DecisionSolicitudRequest = {
        decision,
        vigencia: decision === "aprobada" ? vigencia : undefined,
        observacion: observacion.trim() || undefined,
      };
      const updated = await decidirSolicitudEspecial(id, payload);
      setSolicitud({ ...updated, historial: solicitud?.historial });
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Error al procesar la decisión.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !solicitud) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center max-w-md mx-auto mt-12">
        <p className="text-sm text-red-600 mb-4">{error ?? "Solicitud no encontrada."}</p>
        <button
          onClick={() => router.push("/Desktop/Especiales")}
          className="text-sm font-semibold text-blue-600 hover:underline"
        >
          ← Volver a solicitudes
        </button>
      </div>
    );
  }

  const ini = iniciales(solicitud.nombre_visitante);
  const isPending = solicitud.estado === "pendiente";
  const fotoVisitante = solicitud.foto_visitante;

  return (
    <>
      {/* Back link */}
      <button
        onClick={() => router.push("/Desktop/Especiales")}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 font-medium transition-colors mb-5"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Volver a solicitudes
      </button>

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">
            Solicitud #{String(solicitud.numero ?? "—").padStart(3, "0")} — Revisión de acceso especial
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Recibida el {formatFechaLarga(solicitud.created_at)} · {isPending ? "Pendiente de resolución" : `Resuelta el ${solicitud.fecha_decision ? formatFechaLarga(solicitud.fecha_decision) : "—"}`}
          </p>
        </div>
        <EstadoBadge estado={solicitud.estado} />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Left column ── */}
        <div className="lg:col-span-2 flex flex-col gap-5">

          {/* Visitor data card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
              Datos del visitante
            </h2>
            <div className="flex items-start gap-4 mb-5 pb-5 border-b border-slate-100">
              {fotoVisitante ? (
                <img
                  src={fotoVisitante}
                  alt={solicitud.nombre_visitante}
                  className="w-16 h-16 rounded-xl object-cover shrink-0 border border-slate-200"
                />
              ) : (
                <div className="w-11 h-11 bg-blue-100 rounded-full flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">
                  {ini}
                </div>
              )}
              <div>
                <p className="font-bold text-slate-800">{solicitud.nombre_visitante}</p>
                <p className="text-sm text-slate-500">CC. {solicitud.cedula_visitante}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Motivo de visita
                </p>
                <p className="text-sm text-slate-700 leading-snug">{solicitud.motivo}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Portería
                </p>
                <p className="text-sm text-slate-700">{solicitud.porteria}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Vigilante solicitante
                </p>
                <p className="text-sm text-slate-700">{solicitud.nombre_vigilante || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Hora de solicitud
                </p>
                <p className="text-sm text-slate-700">{formatFechaLarga(solicitud.created_at)}</p>
              </div>
              {!isPending && solicitud.vigencia && (
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Vigencia aprobada
                  </p>
                  <p className="text-sm font-semibold text-emerald-600">
                    {VIGENCIA_LABELS[solicitud.vigencia] ?? solicitud.vigencia}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Observation card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
              Observación del jefe (opcional)
            </h2>
            {isPending ? (
              <textarea
                rows={3}
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                placeholder="Agregar nota para el registro..."
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            ) : (
              <p className="text-sm text-slate-600 min-h-[3rem]">
                {solicitud.observacion_jefe || <span className="text-slate-400 italic">Sin observaciones</span>}
              </p>
            )}
          </div>
        </div>

        {/* ── Right column ── */}
        <div className="flex flex-col gap-5">

          {/* Decision panel */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
              {isPending ? "Tomar decisión" : "Decisión tomada"}
            </h2>

            {isPending ? (
              <div className="flex flex-col gap-4">
                {/* Approve section */}
                <div className="border border-emerald-200 rounded-xl p-4 bg-emerald-50/50">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                    <span className="text-sm font-bold text-emerald-700">Aprobar acceso</span>
                  </div>
                  <p className="text-xs text-slate-500 mb-3">
                    El vigilante recibirá la aprobación de inmediato y podrá permitir el ingreso.
                  </p>
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Vigencia
                  </p>
                  <div className="flex flex-col gap-2 mb-4">
                    {VIGENCIA_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer border transition-all ${
                          vigencia === opt.value
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="vigencia"
                          value={opt.value}
                          checked={vigencia === opt.value}
                          onChange={() => setVigencia(opt.value)}
                          className="accent-emerald-600"
                        />
                        <span className="text-sm font-medium">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={() => handleDecision("aprobada")}
                    disabled={submitting}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl text-sm transition-all active:scale-[0.98]"
                  >
                    {submitting ? "Procesando..." : "Confirmar aprobación"}
                  </button>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-xs text-slate-400 font-medium">o</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                {/* Deny section */}
                <div className="border border-red-200 rounded-xl p-4 bg-red-50/50">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                    <span className="text-sm font-bold text-red-600">Denegar acceso</span>
                  </div>
                  <p className="text-xs text-slate-500 mb-4">
                    El vigilante recibirá la negativa y deberá impedir el ingreso del visitante.
                  </p>
                  <button
                    onClick={() => handleDecision("denegada")}
                    disabled={submitting}
                    className="w-full border-2 border-red-500 hover:bg-red-500 hover:text-white disabled:opacity-60 text-red-600 font-bold py-3 rounded-xl text-sm transition-all active:scale-[0.98]"
                  >
                    {submitting ? "Procesando..." : "Denegar solicitud"}
                  </button>
                </div>

                {submitError && (
                  <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                    {submitError}
                  </p>
                )}
              </div>
            ) : (
              <div
                className={`rounded-xl p-4 border ${
                  solicitud.estado === "aprobada"
                    ? "bg-emerald-50 border-emerald-200"
                    : "bg-red-50 border-red-200"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {solicitud.estado === "aprobada" ? (
                    <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  )}
                  <span className={`font-bold text-sm ${solicitud.estado === "aprobada" ? "text-emerald-700" : "text-red-600"}`}>
                    {solicitud.estado === "aprobada" ? "Acceso aprobado" : "Acceso denegado"}
                  </span>
                </div>
                {solicitud.nombre_jefe && (
                  <p className="text-xs text-slate-500">
                    Por: <span className="font-semibold text-slate-700">{solicitud.nombre_jefe}</span>
                  </p>
                )}
                {solicitud.fecha_decision && (
                  <p className="text-xs text-slate-400 mt-0.5">{formatFechaLarga(solicitud.fecha_decision)}</p>
                )}
              </div>
            )}
          </div>

          {/* Visitor history */}
          {solicitud.historial && solicitud.historial.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
                Historial del visitante
              </h2>
              <div className="flex flex-col gap-2">
                {solicitud.historial.map((h) => (
                  <div key={h.id} className="flex items-center justify-between gap-3 py-2 border-b border-slate-50 last:border-0">
                    <span className="text-xs text-slate-500">{formatFechaCorta(h.created_at)}</span>
                    {h.estado !== "pendiente" && h.estado !== "cancelada" ? (
                      <HistorialBadge estado={h.estado} />
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        {h.estado === "cancelada" ? "Cancelado" : "Pendiente"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
