"use client";

import { useState, useEffect, useRef, useCallback, type RefObject } from "react";
import { useRouter } from "next/navigation";
import {
  cargarSesion,
  getTurnoActivo,
  verificarBiometrico,
  registrarAcceso,
} from "../../../lib/api";
import { type Sesion, type VerificarBiometriaResponse } from "../../../lib/types";
import "../../globals.css";

// ── Iconos ────────────────────────────────────────────────────────────────────

const BackArrowIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5 text-white">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
  </svg>
);

const FaceIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" />
  </svg>
);

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Fase = "inicio" | "captura" | "resultado";

interface EstadoVerificar {
  fase: Fase;
  match: VerificarBiometriaResponse | null;
  error: string | null;
  cargando: boolean;
  accesoRegistrado: boolean;
}

const tipoPersonalMap: Record<string, string> = {
  visitante: "Visitante",
  estudiante: "Estudiante",
  docente: "Docente",
  administrativo: "Administrativo",
  admin: "Administrativo",
  servicios_generales: "Servicios Generales",
};

// ── Componente principal ──────────────────────────────────────────────────────

export default function BiometriaPage() {
  const router = useRouter();
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [turnoActivo, setTurnoActivo] = useState<any>(null);
  const [loadingEstado, setLoadingEstado] = useState(true);

  const [verificar, setVerificar] = useState<EstadoVerificar>({
    fase: "inicio",
    match: null,
    error: null,
    cargando: false,
    accesoRegistrado: false,
  });

  const [cameraReady, setCameraReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ── Sesión y turno ──────────────────────────────────────────────────────────

  useEffect(() => {
    const s = cargarSesion();
    if (!s || s.rol !== "vigilante") { router.push("/login"); return; }
    setSesion(s);
    getTurnoActivo()
      .then(setTurnoActivo)
      .catch(console.error)
      .finally(() => setLoadingEstado(false));
  }, [router]);

  // ── Cámara ──────────────────────────────────────────────────────────────────

  const detenerCamara = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  // Inicia el stream después de que React monte el <video> (que aparece cuando fase === "captura")
  useEffect(() => {
    if (verificar.fase !== "captura") {
      detenerCamara();
      return;
    }
    let cancelado = false;
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    }).then((stream) => {
      if (cancelado) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => { if (!cancelado) setCameraReady(true); };
      }
    }).catch((err: any) => {
      if (!cancelado) {
        const msg = err?.name === "NotAllowedError"
          ? "Permiso de cámara denegado. Habilítalo en los ajustes del navegador."
          : err?.message ?? "No se pudo acceder a la cámara.";
        setVerificar((v) => ({ ...v, error: msg }));
      }
    });
    return () => { cancelado = true; detenerCamara(); };
  }, [verificar.fase, detenerCamara]);

  function capturarFrame(): Promise<File> {
    return new Promise((resolve, reject) => {
      const video = videoRef.current;
      if (!video) return reject(new Error("No hay cámara activa"));
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      canvas.getContext("2d")!.drawImage(video, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("No se pudo capturar el frame"));
          resolve(new File([blob], "face.jpg", { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.92
      );
    });
  }

  // ── Flujo verificar ─────────────────────────────────────────────────────────

  async function capturarVerificar() {
    setVerificar((v) => ({ ...v, cargando: true, error: null }));
    try {
      const foto = await capturarFrame();
      const match = await verificarBiometrico(foto);
      detenerCamara();
      setVerificar((v) => ({ ...v, cargando: false, match, fase: "resultado" }));
    } catch (err: any) {
      setVerificar((v) => ({
        ...v,
        cargando: false,
        error: err?.message ?? "No se encontró coincidencia biométrica.",
      }));
    }
  }

  async function confirmarAcceso() {
    if (!verificar.match) return;
    setVerificar((v) => ({ ...v, cargando: true }));
    try {
      await registrarAcceso({
        codigo_institucional: verificar.match.codigo_institucional,
        modalidad: "Biometrico",
        resultado: verificar.match.tipo.toLowerCase() === "visitante" ? "pendiente" : "permitido",
        observacion: "Acceso por verificación biométrica",
      });
      setVerificar((v) => ({ ...v, cargando: false, accesoRegistrado: true }));
    } catch (err: any) {
      setVerificar((v) => ({
        ...v,
        cargando: false,
        error: err?.message ?? "Error al registrar el acceso.",
      }));
    }
  }

  function resetVerificar() {
    setVerificar({ fase: "inicio", match: null, error: null, cargando: false, accesoRegistrado: false });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

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
            onClick={() => {
              detenerCamara();
              resetVerificar();
              router.push("/Mobile");
            }}
            className="p-2.5 hover:bg-[#1b2535] rounded-xl transition-all duration-200 active:scale-95 border border-[#1b2a42]"
          >
            <BackArrowIcon />
          </button>
          <h1 className="font-extrabold text-lg tracking-wide">Biometría facial</h1>
        </div>
      </div>

      <div className="flex-1 max-w-[420px] mx-auto w-full px-6 py-6 space-y-6">

        {/* Sin turno activo */}
        {!turnoActivo && (
          <div className="bg-[#0b1325]/40 border border-[#1b2a42]/60 rounded-3xl p-6 text-center space-y-3 mt-4">
            <span className="text-2xl block">⚠️</span>
            <h3 className="font-bold text-sm text-slate-300">Turno Requerido</h3>
            <p className="text-xs text-slate-400 leading-relaxed max-w-[260px] mx-auto">
              No puedes gestionar biometría sin un turno activo.
            </p>
            <button
              onClick={() => router.push("/Mobile/Turnos")}
              className="mt-2 text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 rounded-xl transition-all active:scale-95"
            >
              Ir a Turnos
            </button>
          </div>
        )}

        {/* Pantalla de inicio */}
        {turnoActivo && verificar.fase === "inicio" && (
          <div className="space-y-4 pt-2">
            <p className="text-xs text-slate-400 text-center leading-relaxed">
              Identifica a alguien por reconocimiento facial cuando no tenga su credencial disponible
            </p>
            <button
              onClick={() => setVerificar((v) => ({ ...v, fase: "captura", error: null }))}
              className="w-full bg-[#0b1325] hover:bg-[#111c34] border border-[#1b2a42] hover:border-emerald-500/40 rounded-3xl p-5 flex items-center gap-4 transition-all active:scale-[0.98] text-left"
            >
              <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center text-emerald-400 shrink-0">
                <FaceIcon />
              </div>
              <div>
                <p className="font-extrabold text-sm text-white">Verificar por rostro</p>
                <p className="text-xs text-slate-400 mt-0.5">Identifica a alguien que olvidó o perdió su credencial</p>
              </div>
            </button>
          </div>
        )}

        {/* Fase: captura */}
        {turnoActivo && verificar.fase === "captura" && (
          <div className="space-y-5">
            <p className="text-xs text-slate-400 text-center leading-relaxed">
              Pide a la persona que mire directamente a la cámara
            </p>

            <VisorCamara videoRef={videoRef} cameraReady={cameraReady} />

            {verificar.error && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 text-xs text-rose-300">
                {verificar.error}
                <button onClick={() => setVerificar((v) => ({ ...v, error: null }))} className="ml-2 underline">
                  Reintentar
                </button>
              </div>
            )}

            <button
              onClick={capturarVerificar}
              disabled={verificar.cargando || !cameraReady}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-sm py-4 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              {verificar.cargando ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Buscando coincidencia...
                </>
              ) : "Capturar y verificar"}
            </button>

            <button
              onClick={resetVerificar}
              className="w-full text-xs text-slate-500 hover:text-slate-300 py-2 transition-colors"
            >
              Cancelar
            </button>
          </div>
        )}

        {/* Fase: resultado */}
        {turnoActivo && verificar.fase === "resultado" && verificar.match && (
          <div className="space-y-4">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-3xl p-4 flex items-center gap-3">
              <div className="w-9 h-9 bg-emerald-500/20 rounded-full flex items-center justify-center shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4 text-emerald-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <div>
                <p className="font-extrabold text-sm text-emerald-400">Persona identificada</p>
                <p className="text-[11px] text-emerald-300/70 mt-0.5">
                  Confianza: {((1 - verificar.match.distancia) * 100).toFixed(1)}%
                </p>
              </div>
            </div>

            <div className="bg-[#0b1325] border border-[#1b2a42] rounded-3xl p-5 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#1b2a42] border border-[#2b3e5d] rounded-full flex items-center justify-center font-extrabold text-white text-sm">
                  {verificar.match.nombre.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
                </div>
                <div>
                  <p className="font-extrabold text-base text-white">{verificar.match.nombre}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {tipoPersonalMap[verificar.match.tipo.toLowerCase()] ?? verificar.match.tipo}
                  </p>
                </div>
              </div>
              <div className="border-t border-[#142035]/80 pt-4">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-semibold">Código</span>
                  <span className="font-bold text-white font-mono">{verificar.match.codigo_institucional}</span>
                </div>
              </div>
            </div>

            {verificar.error && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 text-xs text-rose-300">
                {verificar.error}
              </div>
            )}

            {verificar.accesoRegistrado ? (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-4 py-3 text-xs text-emerald-300 text-center font-semibold">
                Acceso registrado correctamente
              </div>
            ) : (
              <button
                onClick={confirmarAcceso}
                disabled={verificar.cargando}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-sm py-4 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {verificar.cargando ? (
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : "Confirmar y registrar acceso"}
              </button>
            )}

            <button
              onClick={resetVerificar}
              className="w-full bg-[#0b1325] border border-[#1b2a42] hover:bg-[#111c34] text-white font-bold text-sm py-3 rounded-2xl transition-all active:scale-95"
            >
              Nueva verificación
            </button>
          </div>
        )}

      </div>

      <div className="py-4 text-center border-t border-[#142035] bg-[#070e1e]/40">
        <span className="text-[9px] text-[#2c3d52] tracking-[0.15em] font-bold uppercase select-none">
          UD-Safe · Control de Acceso
        </span>
      </div>

    </div>
  );
}

// ── Visor de cámara ───────────────────────────────────────────────────────────

function VisorCamara({
  videoRef,
  cameraReady,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  cameraReady: boolean;
}) {
  return (
    <div className="relative w-64 h-64 bg-[#091122] rounded-[36px] border border-emerald-500/30 shadow-inner mx-auto flex items-center justify-center overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover rounded-[36px]"
        style={{ transform: "scaleX(-1)" }}
      />

      {!cameraReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#091122] z-10 space-y-2 rounded-[36px]">
          <span className="inline-block w-6 h-6 border-2 border-slate-600 border-t-white rounded-full animate-spin" />
          <span className="text-[10px] text-slate-400 font-bold uppercase">Cargando cámara...</span>
        </div>
      )}

      <div className="absolute top-8 left-8 w-6 h-6 border-t-[3px] border-l-[3px] border-emerald-500 rounded-tl-lg z-20" />
      <div className="absolute top-8 right-8 w-6 h-6 border-t-[3px] border-r-[3px] border-emerald-500 rounded-tr-lg z-20" />
      <div className="absolute bottom-8 left-8 w-6 h-6 border-b-[3px] border-l-[3px] border-emerald-500 rounded-bl-lg z-20" />
      <div className="absolute bottom-8 right-8 w-6 h-6 border-b-[3px] border-r-[3px] border-emerald-500 rounded-br-lg z-20" />

      {cameraReady && (
        <div className="absolute inset-[28px] rounded-full border-2 border-dashed border-emerald-500 opacity-40 z-20" />
      )}
    </div>
  );
}
