"use client";

import { useState, useEffect, useRef, useCallback, type RefObject } from "react";
import { useRouter } from "next/navigation";
import {
  cargarSesion,
  getTurnoActivo,
  validarAcceso,
  estadoBiometria,
  enrollBiometria,
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

const CameraIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 10.5a3 3 0 1 1 6 0 3 3 0 0 1-6 0Z" />
  </svg>
);

const FaceIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" />
  </svg>
);

// ── Tipos internos ─────────────────────────────────────────────────────────────

type Modo = null | "enroll" | "verificar";

interface EstadoEnroll {
  fase: "buscar" | "captura" | "resultado";
  personal: { id: string; nombre: string; tipo: string; codigo: string } | null;
  tieneBiometria: boolean;
  error: string | null;
  cargando: boolean;
  exitoso: boolean;
}

interface EstadoVerificar {
  fase: "captura" | "resultado";
  match: VerificarBiometriaResponse | null;
  error: string | null;
  cargando: boolean;
  accesoRegistrado: boolean;
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function BiometriaPage() {
  const router = useRouter();
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [turnoActivo, setTurnoActivo] = useState<any>(null);
  const [loadingEstado, setLoadingEstado] = useState(true);
  const [modo, setModo] = useState<Modo>(null);

  const [enroll, setEnroll] = useState<EstadoEnroll>({
    fase: "buscar",
    personal: null,
    tieneBiometria: false,
    error: null,
    cargando: false,
    exitoso: false,
  });

  const [verificar, setVerificar] = useState<EstadoVerificar>({
    fase: "captura",
    match: null,
    error: null,
    cargando: false,
    accesoRegistrado: false,
  });

  const [codigoBusqueda, setCodigoBusqueda] = useState("");
  const [cameraReady, setCameraReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ── Sesión y turno ──────────────────────────────────────────────────────────

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

  // ── Cámara ──────────────────────────────────────────────────────────────────

  const iniciarCamara = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => setCameraReady(true);
      }
    } catch {
      // el error se maneja en el flujo de captura
    }
  }, []);

  const detenerCamara = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  // Arrancar/detener cámara según modo y fase
  useEffect(() => {
    const necesitaCamara =
      (modo === "enroll" && enroll.fase === "captura") ||
      (modo === "verificar" && verificar.fase === "captura");

    if (necesitaCamara) {
      iniciarCamara();
    } else {
      detenerCamara();
    }

    return detenerCamara;
  }, [modo, enroll.fase, verificar.fase, iniciarCamara, detenerCamara]);

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

  // ── Flujo Enroll ────────────────────────────────────────────────────────────

  async function buscarPersonal() {
    if (!codigoBusqueda.trim()) return;
    setEnroll((e) => ({ ...e, cargando: true, error: null, personal: null }));
    try {
      const p = await validarAcceso(codigoBusqueda.trim());
      const bio = await estadoBiometria(p.id);
      setEnroll((e) => ({
        ...e,
        personal: { id: p.id, nombre: p.nombre, tipo: p.tipo, codigo: p.codigo_institucional },
        tieneBiometria: bio.tiene_biometria,
        cargando: false,
      }));
    } catch (err: any) {
      setEnroll((e) => ({
        ...e,
        cargando: false,
        error: err?.message ?? "No se encontró el personal con ese código.",
      }));
    }
  }

  async function capturarEnroll() {
    if (!enroll.personal) return;
    setEnroll((e) => ({ ...e, cargando: true, error: null }));
    try {
      const foto = await capturarFrame();
      await enrollBiometria(enroll.personal.id, foto);
      detenerCamara();
      setEnroll((e) => ({ ...e, cargando: false, exitoso: true, fase: "resultado" }));
    } catch (err: any) {
      setEnroll((e) => ({
        ...e,
        cargando: false,
        error: err?.message ?? "Error al procesar la biometría.",
      }));
    }
  }

  // ── Flujo Verificar ─────────────────────────────────────────────────────────

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

  async function confirmarAccesoBiometrico() {
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

  // ── Helpers de UI ───────────────────────────────────────────────────────────

  function resetEnroll() {
    setEnroll({ fase: "buscar", personal: null, tieneBiometria: false, error: null, cargando: false, exitoso: false });
    setCodigoBusqueda("");
  }

  function resetVerificar() {
    setVerificar({ fase: "captura", match: null, error: null, cargando: false, accesoRegistrado: false });
  }

  function salirModo() {
    detenerCamara();
    resetEnroll();
    resetVerificar();
    setModo(null);
  }

  const tipoPersonalMap: Record<string, string> = {
    visitante: "Visitante",
    estudiante: "Estudiante",
    docente: "Docente",
    administrativo: "Administrativo",
    admin: "Administrativo",
    servicios_generales: "Servicios Generales",
  };

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
            onClick={modo ? salirModo : () => router.push("/Mobile")}
            className="p-2.5 hover:bg-[#1b2535] rounded-xl transition-all duration-200 active:scale-95 border border-[#1b2a42]"
          >
            <BackArrowIcon />
          </button>
          <h1 className="font-extrabold text-lg tracking-wide">
            {modo === "enroll" ? "Registrar biometría" : modo === "verificar" ? "Verificar por rostro" : "Biometría facial"}
          </h1>
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
            <button onClick={() => router.push("/Mobile/Turnos")} className="mt-2 text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 rounded-xl transition-all active:scale-95">
              Ir a Turnos
            </button>
          </div>
        )}

        {/* Selector de modo */}
        {turnoActivo && !modo && (
          <div className="space-y-4 pt-2">
            <p className="text-xs text-slate-400 text-center leading-relaxed">
              Selecciona qué deseas hacer
            </p>

            {/* Enrolar */}
            <button
              onClick={() => setModo("enroll")}
              className="w-full bg-[#0b1325] hover:bg-[#111c34] border border-[#1b2a42] hover:border-violet-500/40 rounded-3xl p-5 flex items-center gap-4 transition-all active:scale-[0.98] text-left"
            >
              <div className="w-12 h-12 bg-violet-500/10 border border-violet-500/30 rounded-2xl flex items-center justify-center text-violet-400 shrink-0">
                <CameraIcon />
              </div>
              <div>
                <p className="font-extrabold text-sm text-white">Registrar biometría</p>
                <p className="text-xs text-slate-400 mt-0.5">Vincular el rostro de un miembro del personal a su código</p>
              </div>
            </button>

            {/* Verificar */}
            <button
              onClick={() => setModo("verificar")}
              className="w-full bg-[#0b1325] hover:bg-[#111c34] border border-[#1b2a42] hover:border-emerald-500/40 rounded-3xl p-5 flex items-center gap-4 transition-all active:scale-[0.98] text-left"
            >
              <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center text-emerald-400 shrink-0">
                <FaceIcon />
              </div>
              <div>
                <p className="font-extrabold text-sm text-white">Verificar por rostro</p>
                <p className="text-xs text-slate-400 mt-0.5">Identificar a alguien que olvidó o perdió su credencial</p>
              </div>
            </button>
          </div>
        )}

        {/* ── Modo Enroll ────────────────────────────────────────────────────── */}
        {turnoActivo && modo === "enroll" && (

          <div className="space-y-5">

            {/* Fase: buscar personal */}
            {enroll.fase === "buscar" && (
              <>
                <p className="text-xs text-slate-400 text-center leading-relaxed">
                  Ingresa el código institucional de la persona a enrolar
                </p>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={codigoBusqueda}
                    onChange={(e) => setCodigoBusqueda(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && buscarPersonal()}
                    placeholder="Código institucional"
                    className="flex-1 bg-[#0b1325] border border-[#1b2a42] focus:border-violet-500/60 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none transition-colors"
                  />
                  <button
                    onClick={buscarPersonal}
                    disabled={enroll.cargando || !codigoBusqueda.trim()}
                    className="px-4 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 rounded-xl font-bold text-xs text-white transition-all active:scale-95"
                  >
                    {enroll.cargando ? (
                      <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : "Buscar"}
                  </button>
                </div>

                {enroll.error && (
                  <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 text-xs text-rose-300">
                    {enroll.error}
                  </div>
                )}

                {enroll.personal && (
                  <div className="bg-[#0b1325] border border-[#1b2a42] rounded-3xl p-5 space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-[#1b2a42] border border-[#2b3e5d] rounded-full flex items-center justify-center font-extrabold text-white text-sm">
                        {enroll.personal.nombre.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
                      </div>
                      <div>
                        <p className="font-extrabold text-sm text-white">{enroll.personal.nombre}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{tipoPersonalMap[enroll.personal.tipo.toLowerCase()] ?? enroll.personal.tipo}</p>
                      </div>
                    </div>

                    {enroll.tieneBiometria && (
                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 text-xs text-amber-300">
                        Ya tiene biometría registrada. Capturar reemplazará el registro anterior.
                      </div>
                    )}

                    <button
                      onClick={() => setEnroll((e) => ({ ...e, fase: "captura" }))}
                      className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm py-3 rounded-2xl transition-all active:scale-95"
                    >
                      Continuar con captura facial
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Fase: captura */}
            {enroll.fase === "captura" && enroll.personal && (
              <>
                <p className="text-xs text-slate-400 text-center">
                  Pide a <span className="text-white font-bold">{enroll.personal.nombre.split(" ")[0]}</span> que mire directamente a la cámara
                </p>

                <VisorCamara videoRef={videoRef} cameraReady={cameraReady} accentColor="violet" />

                {enroll.error && (
                  <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 text-xs text-rose-300">
                    {enroll.error}
                  </div>
                )}

                <button
                  onClick={capturarEnroll}
                  disabled={enroll.cargando || !cameraReady}
                  className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-bold text-sm py-4 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  {enroll.cargando ? (
                    <>
                      <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Procesando rostro...
                    </>
                  ) : "Capturar y registrar"}
                </button>
              </>
            )}

            {/* Fase: resultado */}
            {enroll.fase === "resultado" && (
              <div className="space-y-4 text-center">
                <div className="w-16 h-16 bg-violet-500/20 border border-violet-500/30 rounded-full flex items-center justify-center mx-auto">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-8 h-8 text-violet-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </div>
                <div>
                  <p className="font-extrabold text-base text-violet-400">Biometría registrada</p>
                  <p className="text-xs text-slate-400 mt-1">
                    El rostro de <span className="text-white">{enroll.personal?.nombre}</span> quedó vinculado a su código institucional.
                  </p>
                </div>
                <button onClick={resetEnroll} className="w-full bg-[#0b1325] border border-[#1b2a42] hover:bg-[#111c34] text-white font-bold text-sm py-3 rounded-2xl transition-all active:scale-95">
                  Registrar otro
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Modo Verificar ──────────────────────────────────────────────────── */}
        {turnoActivo && modo === "verificar" && (

          <div className="space-y-5">

            {/* Fase: captura */}
            {verificar.fase === "captura" && (
              <>
                <p className="text-xs text-slate-400 text-center leading-relaxed">
                  Pide a la persona que mire directamente a la cámara
                </p>

                <VisorCamara videoRef={videoRef} cameraReady={cameraReady} accentColor="emerald" />

                {verificar.error && (
                  <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 text-xs text-rose-300">
                    {verificar.error}
                    <button onClick={() => setVerificar((v) => ({ ...v, error: null }))} className="ml-2 underline">Reintentar</button>
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
              </>
            )}

            {/* Fase: resultado */}
            {verificar.fase === "resultado" && verificar.match && (
              <div className="space-y-4">

                {/* Persona identificada */}
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-3xl p-4 flex items-center gap-3">
                  <div className="w-9 h-9 bg-emerald-500/20 rounded-full flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4 text-emerald-400">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-extrabold text-sm text-emerald-400">Persona identificada</p>
                    <p className="text-[11px] text-emerald-300/70 mt-0.5">Confianza: {((1 - verificar.match.distancia) * 100).toFixed(1)}%</p>
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
                  <div className="border-t border-[#142035]/80 pt-4 space-y-3">
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
                    onClick={confirmarAccesoBiometrico}
                    disabled={verificar.cargando}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-sm py-4 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    {verificar.cargando ? (
                      <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : "Confirmar y registrar acceso"}
                  </button>
                )}

                <button onClick={resetVerificar} className="w-full bg-[#0b1325] border border-[#1b2a42] hover:bg-[#111c34] text-white font-bold text-sm py-3 rounded-2xl transition-all active:scale-95">
                  Nueva verificación
                </button>
              </div>
            )}
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

// ── Visor de cámara reutilizable ───────────────────────────────────────────────

function VisorCamara({
  videoRef,
  cameraReady,
  accentColor,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  cameraReady: boolean;
  accentColor: "emerald" | "violet";
}) {
  const border = accentColor === "emerald" ? "border-emerald-500" : "border-violet-500";
  const ring = accentColor === "emerald" ? "border-emerald-500/30" : "border-violet-500/30";

  return (
    <div className={`relative w-64 h-64 bg-[#091122] rounded-[36px] border ${ring} shadow-inner mx-auto flex items-center justify-center overflow-hidden`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover rounded-[36px]"
      />

      {!cameraReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#091122] z-10 space-y-2 rounded-[36px]">
          <span className="inline-block w-6 h-6 border-2 border-slate-600 border-t-white rounded-full animate-spin" />
          <span className="text-[10px] text-slate-400 font-bold uppercase">Cargando cámara...</span>
        </div>
      )}

      {/* Esquineros */}
      <div className={`absolute top-8 left-8 w-6 h-6 border-t-[3px] border-l-[3px] ${border} rounded-tl-lg z-20`} />
      <div className={`absolute top-8 right-8 w-6 h-6 border-t-[3px] border-r-[3px] ${border} rounded-tr-lg z-20`} />
      <div className={`absolute bottom-8 left-8 w-6 h-6 border-b-[3px] border-l-[3px] ${border} rounded-bl-lg z-20`} />
      <div className={`absolute bottom-8 right-8 w-6 h-6 border-b-[3px] border-r-[3px] ${border} rounded-br-lg z-20`} />

      {/* Guía oval del rostro */}
      {cameraReady && (
        <div className={`absolute inset-[28px] rounded-full border-2 border-dashed ${border} opacity-40 z-20`} />
      )}
    </div>
  );
}
