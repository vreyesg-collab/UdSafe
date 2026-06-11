"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  cargarSesion,
  getTurnoActivo,
  iniciarTurno,
  finalizarTurno,
} from "../../../lib/api";
import { type Sesion } from "../../../lib/types";
import "../../globals.css";

// ─── ICONOS ────────────────────────────────────────────────────────────────────

const BackArrowIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5 text-white">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
  </svg>
);

const CameraIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" className="w-8 h-8 text-[#4c607a] group-hover:scale-110 transition-transform">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
  </svg>
);

const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" className="w-5 h-5 text-red-500">
    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
  </svg>
);

const ClockIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-5 h-5 text-[#4c607a]">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </svg>
);

// ─── COMPONENTE ────────────────────────────────────────────────────────────────

export default function ShiftManagerPage() {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [turnoActivo, setTurnoActivo] = useState<any>(null);
  const [loadingEstado, setLoadingEstado] = useState(true);

  const [foto, setFoto] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [observaciones, setObservaciones] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const router = useRouter();

  useEffect(() => {
    const s = cargarSesion();
    if (!s || s.rol !== "vigilante") {
      router.push("/login");
      return;
    }
    setSesion(s);
    checkTurnoEstado();
  }, [router]);

  // Limpiar stream al desmontar
  useEffect(() => {
    return () => detenerCamara();
  }, []);

  // Asignar stream al <video> después de que React lo monte
  useEffect(() => {
    if (!cameraActive) return;
    let cancelado = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        });
        if (cancelado) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => { if (!cancelado) setCameraReady(true); };
        }
      } catch {
        if (!cancelado) {
          setError("No se pudo acceder a la cámara. Verifica los permisos del navegador.");
          setCameraActive(false);
        }
      }
    })();
    return () => { cancelado = true; };
  }, [cameraActive]);

  async function checkTurnoEstado() {
    setLoadingEstado(true);
    try {
      const active = await getTurnoActivo();
      setTurnoActivo(active);
    } catch (err: any) {
      console.error("Error al obtener estado de turno:", err);
    } finally {
      setLoadingEstado(false);
    }
  }

  // ── Cámara ──────────────────────────────────────────────────────────────────

  function iniciarCamara() {
    setError(null);
    setCameraReady(false);
    setCameraActive(true); // monta <video>, luego el useEffect arranca el stream
  }

  function detenerCamara() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
    setCameraActive(false);
  }

  function capturarFoto() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], "foto.jpg", { type: "image/jpeg" });
        setFoto(file);
        setFotoPreview(URL.createObjectURL(file));
        detenerCamara();
      },
      "image/jpeg",
      0.92
    );
  }

  function retomar() {
    setFoto(null);
    setFotoPreview(null);
    iniciarCamara();
  }

  // ── Formularios ─────────────────────────────────────────────────────────────

  async function handleIniciarTurno(e: React.FormEvent) {
    e.preventDefault();
    if (!foto) {
      setError("Debes tomarte una foto de entrada para iniciar tu turno.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await iniciarTurno(foto, observaciones);
      setTurnoActivo(res);
      setFoto(null);
      setFotoPreview(null);
      setObservaciones("");
      router.push("/Mobile");
    } catch (err: any) {
      setError(err?.message || "Ocurrió un error al iniciar el turno.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFinalizarTurno(e: React.FormEvent) {
    e.preventDefault();
    if (!foto) {
      setError("Debes tomarte una foto de salida para finalizar tu turno.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await finalizarTurno(foto, observaciones);
      setTurnoActivo(null);
      setFoto(null);
      setFotoPreview(null);
      setObservaciones("");
      router.push("/Mobile");
    } catch (err: any) {
      setError(err?.message || "Ocurrió un error al finalizar el turno.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!sesion || loadingEstado) {
    return (
      <div className="min-h-screen w-full bg-[#f8fafc] flex items-center justify-center">
        <span className="inline-block w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  // ── Slot de cámara reutilizable ──────────────────────────────────────────────

  const slotCamara = (accentClass: string) => (
    <div className="space-y-3">
      {/* Estado: sin foto y sin cámara */}
      {!foto && !cameraActive && (
        <button
          type="button"
          onClick={iniciarCamara}
          className={`w-full h-52 bg-white rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-5 group hover:${accentClass} transition-colors`}
        >
          <CameraIcon />
          <span className="font-bold text-sm text-slate-700 mt-3">Tomar foto</span>
          <span className="text-[11px] text-slate-400 mt-1">Se abrirá la cámara frontal</span>
        </button>
      )}

      {/* Estado: cámara activa */}
      {cameraActive && (
        <div className="space-y-3">
          <div className="relative w-full h-52 bg-slate-900 rounded-3xl overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
            {!cameraReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 space-y-2">
                <span className="inline-block w-6 h-6 border-2 border-slate-600 border-t-white rounded-full animate-spin" />
                <span className="text-[10px] text-slate-400 font-bold uppercase">Cargando cámara...</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={detenerCamara}
              className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm rounded-2xl transition-all active:scale-95"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={capturarFoto}
              disabled={!cameraReady}
              className="flex-[2] py-3 bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white font-bold text-sm rounded-2xl transition-all active:scale-95"
            >
              Capturar
            </button>
          </div>
        </div>
      )}

      {/* Estado: foto capturada */}
      {fotoPreview && !cameraActive && (
        <div className="relative w-full h-52 bg-slate-900 rounded-3xl overflow-hidden shadow-inner">
          <img src={fotoPreview} alt="Foto capturada" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={retomar}
            className="absolute bottom-4 right-4 bg-white/90 p-2.5 rounded-full shadow-lg hover:bg-white active:scale-95 transition-all flex items-center gap-1 text-xs font-bold text-red-600 border border-slate-100"
          >
            <TrashIcon />
            <span>Retomar</span>
          </button>
        </div>
      )}
    </div>
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen w-full bg-[#f8fafc] text-slate-800 flex flex-col justify-between font-sans">

      {/* Header */}
      <div className="bg-[#070e1e] py-5 px-6 text-white shadow-md">
        <div className="max-w-[420px] mx-auto w-full flex items-center gap-4">
          <button
            onClick={() => router.push("/Mobile")}
            className="p-1.5 hover:bg-[#1b2535] rounded-full transition-colors"
          >
            <BackArrowIcon />
          </button>
          <h1 className="font-bold text-lg tracking-tight">Gestión de Turnos</h1>
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 max-w-[420px] mx-auto w-full px-6 py-6 space-y-6">

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 p-4 rounded-2xl text-xs text-red-700 leading-snug">
            <span className="shrink-0 font-bold">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {!turnoActivo ? (
          /* INICIO DE TURNO */
          <div className="space-y-6">

            <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm text-center space-y-2">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-500 mb-2">
                <ClockIcon />
              </div>
              <h2 className="text-lg font-bold text-slate-800">Turno Inactivo</h2>
              <p className="text-xs text-slate-500 leading-relaxed px-4">
                No tienes ningún turno registrado en curso. Toma una foto para iniciar tus labores.
              </p>
            </div>

            <form onSubmit={handleIniciarTurno} className="space-y-6">

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">Foto de Entrada</label>
                {slotCamara("border-[#13633f]")}
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">Observaciones (Opcional)</label>
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Escribe novedades del relevo, estado del puesto de control o equipo asignado..."
                  className="w-full h-24 bg-white border border-slate-200 rounded-2xl p-4 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#13633f] transition-colors resize-none font-sans"
                  disabled={submitting}
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !foto}
                className="w-full bg-[#13633f] hover:bg-[#187a4d] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl transition-all duration-300 shadow-md flex items-center justify-center gap-2"
              >
                {submitting
                  ? <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : "Iniciar Turno de Guardia"}
              </button>

            </form>
          </div>

        ) : (
          /* FIN DE TURNO */
          <div className="space-y-6">

            <div className="bg-[#125d3a]/10 border border-emerald-950/15 rounded-3xl p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
                <span className="text-xs font-bold text-emerald-800 tracking-wider uppercase">Tienes un Turno Activo</span>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-18 h-18 bg-slate-100 rounded-2xl overflow-hidden shrink-0 shadow-sm border border-emerald-950/10">
                  <img src={turnoActivo.foto_inicio} alt="Foto Entrada" className="w-full h-full object-cover" />
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs">
                    <span className="text-slate-500">Iniciado el:</span>
                    <span className="block font-bold text-slate-800">
                      {new Date(turnoActivo.fecha_inicio).toLocaleString("es-CO", {
                        weekday: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      })}
                    </span>
                  </div>
                  {turnoActivo.observaciones && (
                    <div className="text-[11px] text-slate-500 italic bg-[#000000]/5 p-2 rounded-xl border border-black/5">
                      "{turnoActivo.observaciones}"
                    </div>
                  )}
                </div>
              </div>
            </div>

            <form onSubmit={handleFinalizarTurno} className="space-y-6">

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">Foto de Salida (Fin de Turno)</label>
                {slotCamara("border-[#1d4ed8]")}
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">Reporte de Salida / Novedades</label>
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Detalla cualquier incidente ocurrido durante tu guardia o notas relevantes para el relevo..."
                  className="w-full h-24 bg-white border border-slate-200 rounded-2xl p-4 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1d4ed8] transition-colors resize-none font-sans"
                  disabled={submitting}
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !foto}
                className="w-full bg-[#1d4ed8] hover:bg-[#2563eb] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl transition-all duration-300 shadow-md flex items-center justify-center gap-2"
              >
                {submitting
                  ? <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : "Finalizar Turno de Guardia"}
              </button>

            </form>
          </div>
        )}

      </div>

      {/* Footer */}
      <div className="py-4 text-center border-t border-slate-200 bg-slate-50">
        <span className="text-[9px] text-[#94a3b8] tracking-[0.15em] font-bold uppercase select-none">
          UD-Safe · Control de Acceso
        </span>
      </div>

    </div>
  );
}
