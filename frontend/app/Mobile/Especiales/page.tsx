"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  cargarSesion,
  crearSolicitudEspecial,
  getSolicitudEspecial,
  cancelarSolicitudEspecial,
} from "../../../lib/api";
import type { SolicitudEspecial } from "../../../lib/types";

type Estado = "form" | "pending" | "approved" | "denied";

const VIGENCIA_LABELS: Record<string, string> = {
  solo_hoy: "Sólo hoy",
  esta_semana: "Esta semana",
  permanente: "Permanente",
};

const PORTERIA_KEY = "udsafe_solicitud_especial_id";

function iniciales(nombre: string) {
  return nombre
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// ── Visitor avatar ────────────────────────────────────────────────────────────
function VisitorAvatar({
  nombre,
  foto,
  className = "w-10 h-10",
}: {
  nombre: string;
  foto?: string;
  className?: string;
}) {
  if (foto) {
    return (
      <img
        src={foto}
        alt={nombre}
        className={`${className} rounded-full object-cover shrink-0`}
      />
    );
  }
  return (
    <div
      className={`${className} bg-blue-800/60 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0`}
    >
      {iniciales(nombre)}
    </div>
  );
}

// ── Dots animation ────────────────────────────────────────────────────────────
function Dots() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % 4), 500);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex gap-1.5 justify-center mt-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
            i < step ? "bg-amber-400" : "bg-white/20"
          }`}
        />
      ))}
    </div>
  );
}

// ── Camera overlay ────────────────────────────────────────────────────────────
function CameraOverlay({
  onCapture,
  onClose,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 960 } } })
      .then((stream) => {
        if (!mounted) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => setReady(true);
        }
      })
      .catch(() => {
        if (mounted) setError("No se pudo acceder a la cámara. Verifica los permisos.");
      });

    return () => {
      mounted = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function capturar() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0);
    }
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `visitante_${Date.now()}.jpg`, { type: "image/jpeg" });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        onCapture(file);
      },
      "image/jpeg",
      0.92
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Video feed */}
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />

        {/* Viewfinder frame */}
        {ready && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-56 h-72 relative">
              {/* corners */}
              {[
                "top-0 left-0 border-t-2 border-l-2 rounded-tl-xl",
                "top-0 right-0 border-t-2 border-r-2 rounded-tr-xl",
                "bottom-0 left-0 border-b-2 border-l-2 rounded-bl-xl",
                "bottom-0 right-0 border-b-2 border-r-2 rounded-br-xl",
              ].map((cls, i) => (
                <span key={i} className={`absolute w-8 h-8 border-white ${cls}`} />
              ))}
            </div>
          </div>
        )}

        {/* Loading / error */}
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center gap-4">
            <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 16.318A4.486 4.486 0 0 0 12.016 15a4.486 4.486 0 0 0-3.198 1.318M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" />
            </svg>
            <p className="text-sm text-white/80">{error}</p>
            <button
              onClick={onClose}
              className="text-sm font-semibold text-white underline underline-offset-2"
            >
              Volver al formulario
            </button>
          </div>
        )}

        {/* Top hint */}
        {ready && (
          <p className="absolute top-6 inset-x-0 text-center text-xs text-white/60 font-medium pointer-events-none">
            Encuadra el rostro del visitante
          </p>
        )}
      </div>

      {/* Bottom controls */}
      <div className="bg-black px-8 py-8 flex items-center justify-between safe-area-bottom">
        <button
          onClick={onClose}
          className="w-12 h-12 flex items-center justify-center text-white/60 hover:text-white transition-colors"
          aria-label="Cancelar"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Shutter */}
        <button
          onClick={capturar}
          disabled={!ready}
          className="w-18 h-18 rounded-full border-4 border-white disabled:opacity-40 flex items-center justify-center transition-transform active:scale-95"
          style={{ width: 72, height: 72 }}
          aria-label="Capturar foto"
        >
          <div className="w-14 h-14 rounded-full bg-white" />
        </button>

        {/* Spacer */}
        <div className="w-12" />
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

// ── Layout shell ──────────────────────────────────────────────────────────────
function Shell({
  onBack,
  children,
}: {
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#070e1e] text-white flex flex-col font-sans">
      <header className="flex items-center gap-3 px-5 pt-12 pb-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Acceso especial
        </button>
      </header>
      <div className="flex-1 max-w-[420px] mx-auto w-full px-5 pb-10 flex flex-col">
        {children}
      </div>
    </div>
  );
}

// ── FORM STATE ────────────────────────────────────────────────────────────────
function FormView({
  onSubmit,
  loading,
  error,
}: {
  onSubmit: (d: {
    nombre: string;
    cedula: string;
    motivo: string;
    porteria: string;
    foto: File;
  }) => void;
  loading: boolean;
  error: string | null;
}) {
  const [nombre, setNombre] = useState("");
  const [cedula, setCedula] = useState("");
  const [motivo, setMotivo] = useState("");
  const [porteria, setPorteria] = useState("Principal");
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [camaraAbierta, setCamaraAbierta] = useState(false);

  useEffect(() => {
    return () => {
      if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    };
  }, [fotoPreview]);

  function handleCaptura(file: File) {
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    setFoto(file);
    setFotoPreview(URL.createObjectURL(file));
    setCamaraAbierta(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!foto) return;
    onSubmit({ nombre, cedula, motivo, porteria, foto });
  }

  const inputCls =
    "w-full bg-[#111827] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/60 transition-colors";
  const labelCls = "text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block";

  return (
    <>
      {camaraAbierta && (
        <CameraOverlay
          onCapture={handleCaptura}
          onClose={() => setCamaraAbierta(false)}
        />
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5 mt-4">
        {/* Icon + Title */}
        <div className="flex flex-col items-center text-center mb-2">
          <div className="w-14 h-14 bg-purple-900/40 border border-purple-500/30 rounded-2xl flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-purple-400" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold">Acceso especial</h1>
          <p className="text-sm text-slate-400 mt-1">Ingresa los datos del visitante</p>
        </div>

        <div>
          <label className={labelCls}>Nombre completo</label>
          <input
            className={inputCls}
            placeholder="Ej. Carlos M. Ruiz Barrera"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelCls}>Número de cédula</label>
          <input
            className={inputCls}
            placeholder="Ej. 1045678923"
            value={cedula}
            onChange={(e) => setCedula(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelCls}>Motivo de la visita</label>
          <textarea
            className={`${inputCls} resize-none`}
            rows={3}
            placeholder="Ej. Reunión con docente del programa de Ing. de Sistemas"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelCls}>Portería</label>
          <select
            className={inputCls}
            value={porteria}
            onChange={(e) => setPorteria(e.target.value)}
          >
            <option value="Principal">Principal</option>
            <option value="Norte">Norte</option>
            <option value="Sur">Sur</option>
            <option value="Occidental">Occidental</option>
          </select>
        </div>

        {/* Foto del visitante */}
        <div>
          <label className={labelCls}>
            Foto del visitante{" "}
            <span className="text-red-400 normal-case font-normal tracking-normal">obligatorio</span>
          </label>

          {!fotoPreview ? (
            <button
              type="button"
              onClick={() => setCamaraAbierta(true)}
              className="w-full border-2 border-dashed border-white/15 hover:border-purple-500/50 active:border-purple-500/70 rounded-xl py-8 flex flex-col items-center gap-2.5 transition-colors"
            >
              <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-300">Abrir cámara</p>
                <p className="text-xs text-slate-500 mt-0.5">Requerida para enviar la solicitud</p>
              </div>
            </button>
          ) : (
            <div className="relative rounded-xl overflow-hidden bg-[#111827]">
              <img
                src={fotoPreview}
                alt="Foto visitante"
                className="w-full h-52 object-cover"
              />
              {/* Retake overlay */}
              <button
                type="button"
                onClick={() => setCamaraAbierta(true)}
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/0 hover:bg-black/50 transition-colors group"
              >
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center gap-1.5">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                  </svg>
                  <span className="text-xs font-semibold text-white">Retomar foto</span>
                </div>
              </button>
              {/* Corner badge */}
              <div className="absolute top-2 right-2 bg-emerald-500 rounded-full p-1 pointer-events-none">
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !foto}
          className="w-full bg-[#125d3a] hover:bg-[#1c7e52] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl transition-all active:scale-[0.98] mt-2"
        >
          {loading ? "Enviando..." : "Enviar solicitud al jefe"}
        </button>
      </form>
    </>
  );
}

// ── PENDING STATE ─────────────────────────────────────────────────────────────
function PendingView({
  solicitud,
  onCancelar,
}: {
  solicitud: SolicitudEspecial;
  onCancelar: () => void;
}) {
  const hora = formatHora(solicitud.created_at);

  return (
    <div className="flex flex-col gap-5 mt-2">
      <div className="flex flex-col items-center text-center py-4">
        <div className="w-14 h-14 bg-amber-500/20 border border-amber-500/30 rounded-full flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold">Esperando respuesta</h2>
        <p className="text-sm text-slate-400 mt-1">Solicitud enviada al jefe de seguridad</p>
        <Dots />
      </div>

      <div className="bg-[#111827] border border-white/10 rounded-2xl overflow-hidden">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-4 pt-4 pb-2">
          Datos de la solicitud
        </p>
        <div className="flex items-center gap-3 px-4 pb-4 border-b border-white/5">
          <VisitorAvatar nombre={solicitud.nombre_visitante} foto={solicitud.foto_visitante} />
          <div>
            <p className="font-semibold text-sm">{solicitud.nombre_visitante}</p>
            <p className="text-xs text-slate-500">CC. {solicitud.cedula_visitante}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4">
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Motivo</p>
            <p className="text-xs text-slate-200 mt-0.5 leading-snug">{solicitud.motivo}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Portería</p>
            <p className="text-xs text-slate-200 mt-0.5">{solicitud.porteria}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Enviado a las</p>
            <p className="text-xs text-slate-200 mt-0.5">{hora}</p>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
        <svg className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
        </svg>
        <p className="text-xs text-slate-400 leading-relaxed">
          Solicita al visitante que espere mientras el jefe de seguridad revisa la solicitud.
        </p>
      </div>

      <button
        onClick={onCancelar}
        className="w-full border border-red-500/30 hover:border-red-500/60 text-red-400 hover:text-red-300 font-semibold py-3.5 rounded-2xl text-sm transition-all active:scale-[0.98]"
      >
        Cancelar solicitud
      </button>
    </div>
  );
}

// ── APPROVED STATE ────────────────────────────────────────────────────────────
function ApprovedView({
  solicitud,
  onPermitir,
}: {
  solicitud: SolicitudEspecial;
  onPermitir: () => void;
}) {
  const horaDecision = solicitud.fecha_decision ? formatHora(solicitud.fecha_decision) : "";
  const jefeIni = solicitud.nombre_jefe ? iniciales(solicitud.nombre_jefe) : "JS";

  return (
    <div className="flex flex-col gap-5 mt-2">
      <div className="flex flex-col items-center text-center py-4">
        <div className="w-14 h-14 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-emerald-400">Acceso aprobado</h2>
        <p className="text-sm text-slate-400 mt-1">Autorizado por el jefe de seguridad</p>
      </div>

      <div className="bg-[#0d1f14] border border-emerald-500/20 rounded-2xl px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 bg-emerald-800/60 rounded-full flex items-center justify-center text-xs font-bold text-emerald-300 shrink-0">
          {jefeIni}
        </div>
        <div>
          <p className="text-[10px] text-emerald-600 uppercase tracking-wider">Aprobado por</p>
          <p className="text-sm font-semibold text-white">
            {solicitud.nombre_jefe || "Jefe de Seguridad"}
            {horaDecision && (
              <span className="text-slate-400 font-normal"> · {horaDecision}</span>
            )}
          </p>
          <p className="text-xs text-slate-500">Jefe de Seguridad</p>
        </div>
      </div>

      <div className="bg-[#111827] border border-white/10 rounded-2xl overflow-hidden">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-4 pt-4 pb-2">
          Visitante
        </p>
        <div className="flex items-center gap-3 px-4 pb-4 border-b border-white/5">
          <VisitorAvatar nombre={solicitud.nombre_visitante} foto={solicitud.foto_visitante} />
          <div>
            <p className="font-semibold text-sm">{solicitud.nombre_visitante}</p>
            <p className="text-xs text-slate-500">CC. {solicitud.cedula_visitante}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4">
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Motivo</p>
            <p className="text-xs text-slate-200 mt-0.5 leading-snug">{solicitud.motivo}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Vigencia</p>
            <p className="text-xs text-emerald-400 font-medium mt-0.5">
              {solicitud.vigencia ? VIGENCIA_LABELS[solicitud.vigencia] ?? solicitud.vigencia : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Portería</p>
            <p className="text-xs text-slate-200 mt-0.5">{solicitud.porteria}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
        <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
        <p className="text-xs text-emerald-400">Evento registrado automáticamente en el sistema</p>
      </div>

      <button
        onClick={onPermitir}
        className="w-full bg-[#125d3a] hover:bg-[#1c7e52] text-white font-bold py-4 rounded-2xl transition-all active:scale-[0.98] text-base"
      >
        Permitir ingreso
      </button>
    </div>
  );
}

// ── DENIED STATE ──────────────────────────────────────────────────────────────
function DeniedView({
  solicitud,
  onRegresar,
}: {
  solicitud: SolicitudEspecial;
  onRegresar: () => void;
}) {
  return (
    <div className="flex flex-col gap-5 mt-2">
      <div className="flex flex-col items-center text-center py-6">
        <div className="w-14 h-14 bg-red-500/20 border border-red-500/30 rounded-full flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-red-400">Acceso denegado</h2>
        <p className="text-sm text-slate-400 mt-1 leading-relaxed">
          La solicitud fue rechazada por el jefe de seguridad
        </p>
      </div>

      {solicitud.observacion_jefe && (
        <div className="bg-[#111827] border border-white/10 rounded-2xl px-4 py-4">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
            Motivo del rechazo
          </p>
          <p className="text-sm text-slate-300 leading-relaxed">{solicitud.observacion_jefe}</p>
        </div>
      )}

      <div className="bg-[#111827] border border-white/10 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-4">
          <VisitorAvatar nombre={solicitud.nombre_visitante} foto={solicitud.foto_visitante} />
          <div>
            <p className="font-semibold text-sm">{solicitud.nombre_visitante}</p>
            <p className="text-xs text-slate-500">CC. {solicitud.cedula_visitante}</p>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-500 text-center px-4">
        Informa al visitante que no puede ingresar en este momento.
      </p>

      <button
        onClick={onRegresar}
        className="w-full bg-[#1b2535] hover:bg-[#253347] text-white font-semibold py-4 rounded-2xl transition-all active:scale-[0.98]"
      >
        Regresar al inicio
      </button>
    </div>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function EspecialesPage() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>("form");
  const [solicitud, setSolicitud] = useState<SolicitudEspecial | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const solicitudIdRef = useRef<string | null>(null);

  useEffect(() => {
    const sesion = cargarSesion();
    if (!sesion) { router.push("/login"); return; }

    const savedId = localStorage.getItem(PORTERIA_KEY);
    if (!savedId) return;

    solicitudIdRef.current = savedId;
    getSolicitudEspecial(savedId)
      .then((s) => {
        setSolicitud(s);
        if (s.estado === "pendiente") setEstado("pending");
        else if (s.estado === "aprobada") setEstado("approved");
        else if (s.estado === "denegada") setEstado("denied");
        else {
          localStorage.removeItem(PORTERIA_KEY);
          solicitudIdRef.current = null;
        }
      })
      .catch(() => {
        localStorage.removeItem(PORTERIA_KEY);
        solicitudIdRef.current = null;
      });
  }, [router]);

  useEffect(() => {
    if (estado !== "pending" || !solicitudIdRef.current) return;

    const poll = async () => {
      try {
        const s = await getSolicitudEspecial(solicitudIdRef.current!);
        setSolicitud(s);
        if (s.estado === "aprobada") setEstado("approved");
        else if (s.estado === "denegada") setEstado("denied");
        else if (s.estado === "cancelada") {
          localStorage.removeItem(PORTERIA_KEY);
          solicitudIdRef.current = null;
          setEstado("form");
        }
      } catch {}
    };

    pollingRef.current = setInterval(poll, 4000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [estado]);

  async function handleSubmit(data: {
    nombre: string;
    cedula: string;
    motivo: string;
    porteria: string;
    foto: File;
  }) {
    setLoading(true);
    setError(null);
    try {
      const s = await crearSolicitudEspecial(
        {
          nombre_visitante: data.nombre,
          cedula_visitante: data.cedula,
          motivo: data.motivo,
          porteria: data.porteria,
        },
        data.foto
      );
      setSolicitud(s);
      solicitudIdRef.current = s.id;
      localStorage.setItem(PORTERIA_KEY, s.id);
      setEstado("pending");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al enviar la solicitud.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelar() {
    if (!solicitudIdRef.current) return;
    try { await cancelarSolicitudEspecial(solicitudIdRef.current); } catch {}
    localStorage.removeItem(PORTERIA_KEY);
    solicitudIdRef.current = null;
    setSolicitud(null);
    setEstado("form");
  }

  function handlePermitirIngreso() {
    localStorage.removeItem(PORTERIA_KEY);
    router.push("/Mobile");
  }

  function handleRegresar() {
    localStorage.removeItem(PORTERIA_KEY);
    solicitudIdRef.current = null;
    setSolicitud(null);
    setEstado("form");
  }

  function handleBack() {
    if (estado === "pending") return;
    router.push("/Mobile");
  }

  return (
    <Shell onBack={handleBack}>
      {estado === "form" && (
        <FormView onSubmit={handleSubmit} loading={loading} error={error} />
      )}
      {estado === "pending" && solicitud && (
        <PendingView solicitud={solicitud} onCancelar={handleCancelar} />
      )}
      {estado === "approved" && solicitud && (
        <ApprovedView solicitud={solicitud} onPermitir={handlePermitirIngreso} />
      )}
      {estado === "denied" && solicitud && (
        <DeniedView solicitud={solicitud} onRegresar={handleRegresar} />
      )}
    </Shell>
  );
}
