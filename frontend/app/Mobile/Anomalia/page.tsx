"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cargarSesion, getTurnoActivo, crearAlerta } from "../../../lib/api";
import { type Sesion } from "../../../lib/types";
import "../../globals.css";

// ── Iconos ────────────────────────────────────────────────────────────────────

const BackArrowIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5 text-white">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
  </svg>
);

const TIPOS_ALERTA = [
  { label: "Persona sospechosa", icon: "👤" },
  { label: "Pelea o agresión", icon: "⚠️" },
  { label: "Robo o hurto", icon: "🚨" },
  { label: "Acceso no autorizado", icon: "🚫" },
  { label: "Daño a instalaciones", icon: "🏚️" },
  { label: "Otro", icon: "📋" },
];

type Fase = "formulario" | "confirmado";

export default function AnomaliaPage() {
  const router = useRouter();
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [turnoActivo, setTurnoActivo] = useState<any>(null);
  const [loadingEstado, setLoadingEstado] = useState(true);

  const [fase, setFase] = useState<Fase>("formulario");
  const [tipoSeleccionado, setTipoSeleccionado] = useState<string | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = cargarSesion();
    if (!s || s.rol !== "vigilante") {
      router.push("/login");
      return;
    }
    setSesion(s);
    getTurnoActivo()
      .then(setTurnoActivo)
      .catch(console.error)
      .finally(() => setLoadingEstado(false));
  }, [router]);

  async function enviarAlerta() {
    if (!tipoSeleccionado) return;
    setEnviando(true);
    setError(null);
    try {
      await crearAlerta({
        asunto: tipoSeleccionado,
        descripcion: descripcion.trim() || tipoSeleccionado,
      });
      setFase("confirmado");
    } catch (err: any) {
      setError(err?.message ?? "No se pudo enviar la alerta. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  function reset() {
    setFase("formulario");
    setTipoSeleccionado(null);
    setDescripcion("");
    setError(null);
  }

  if (!sesion || loadingEstado) {
    return (
      <div className="min-h-screen w-full bg-[#070c18] flex items-center justify-center">
        <span className="inline-block w-8 h-8 border-4 border-[#1b2a42] border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#070c18] text-slate-100 flex flex-col font-sans">

      {/* Header */}
      <div className="py-5 px-6 border-b border-[#142035]/60 bg-[#070e1e]/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[420px] mx-auto w-full flex items-center gap-4">
          <button
            onClick={() => router.push("/Mobile")}
            className="p-2.5 hover:bg-[#1b2535] rounded-xl transition-all duration-200 active:scale-95 border border-[#1b2a42]"
          >
            <BackArrowIcon />
          </button>
          <h1 className="font-extrabold text-lg tracking-wide">Reportar anomalía</h1>
        </div>
      </div>

      <div className="flex-1 max-w-[420px] mx-auto w-full px-6 py-6 space-y-6">

        {/* Sin turno activo */}
        {!turnoActivo && (
          <div className="bg-[#0b1325]/40 border border-[#1b2a42]/60 rounded-3xl p-6 text-center space-y-3 mt-4">
            <span className="text-2xl block">⚠️</span>
            <h3 className="font-bold text-sm text-slate-300">Turno Requerido</h3>
            <p className="text-xs text-slate-400 leading-relaxed max-w-[260px] mx-auto">
              No puedes reportar anomalías sin un turno activo.
            </p>
            <button
              onClick={() => router.push("/Mobile/Turnos")}
              className="mt-2 text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 rounded-xl transition-all active:scale-95"
            >
              Ir a Turnos
            </button>
          </div>
        )}

        {/* Formulario */}
        {turnoActivo && fase === "formulario" && (
          <>
            {/* Aviso urgencia */}
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl px-4 py-3 flex items-start gap-3">
              <span className="text-lg shrink-0">🚨</span>
              <p className="text-xs text-red-300 leading-relaxed">
                Esta alerta será enviada inmediatamente al jefe de seguridad. Úsala solo para situaciones que requieran atención.
              </p>
            </div>

            {/* Tipo de anomalía */}
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-400 tracking-widest uppercase">Tipo de anomalía</p>
              <div className="grid grid-cols-2 gap-2.5">
                {TIPOS_ALERTA.map(({ label, icon }) => (
                  <button
                    key={label}
                    onClick={() => setTipoSeleccionado(label)}
                    className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl border text-left transition-all active:scale-[0.97] text-sm font-semibold
                      ${tipoSeleccionado === label
                        ? "bg-red-500/20 border-red-500/60 text-red-300"
                        : "bg-[#0b1325] border-[#1b2a42] text-slate-300 hover:border-red-500/30"
                      }`}
                  >
                    <span className="text-base shrink-0">{icon}</span>
                    <span className="leading-tight text-xs">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Descripción adicional */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-400 tracking-widest uppercase">Detalles adicionales (opcional)</p>
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Describe la situación: ubicación, personas involucradas, qué está ocurriendo..."
                rows={4}
                className="w-full bg-[#0b1325] border border-[#1b2a42] focus:border-red-500/50 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none transition-colors resize-none"
              />
            </div>

            {error && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 text-xs text-rose-300">
                {error}
              </div>
            )}

            <button
              onClick={enviarAlerta}
              disabled={!tipoSeleccionado || enviando}
              className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-extrabold text-sm py-4 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              {enviando ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Enviando alerta...
                </>
              ) : "Enviar alerta de seguridad"}
            </button>
          </>
        )}

        {/* Confirmación */}
        {turnoActivo && fase === "confirmado" && (
          <div className="space-y-6 text-center pt-4">
            <div className="w-20 h-20 bg-red-500/20 border border-red-500/30 rounded-full flex items-center justify-center mx-auto">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-10 h-10 text-red-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>

            <div className="space-y-2">
              <p className="font-extrabold text-xl text-red-400">Alerta enviada</p>
              <p className="text-sm text-slate-400 leading-relaxed max-w-[260px] mx-auto">
                El jefe de seguridad ha sido notificado sobre <span className="text-white font-semibold">"{tipoSeleccionado}"</span>.
              </p>
            </div>

            <div className="space-y-2.5 pt-2">
              <button
                onClick={reset}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold text-sm py-3.5 rounded-2xl transition-all active:scale-95"
              >
                Reportar otra anomalía
              </button>
              <button
                onClick={() => router.push("/Mobile")}
                className="w-full bg-[#0b1325] border border-[#1b2a42] hover:bg-[#111c34] text-white font-bold text-sm py-3.5 rounded-2xl transition-all active:scale-95"
              >
                Volver al panel
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Footer */}
      <div className="py-4 text-center border-t border-[#142035] bg-[#070e1e]/40">
        <span className="text-[9px] text-[#2c3d52] tracking-[0.15em] font-bold uppercase select-none">
          UD-Safe · Control de Acceso
        </span>
      </div>

    </div>
  );
}
