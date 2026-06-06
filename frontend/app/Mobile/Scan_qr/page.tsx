"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  cargarSesion,
  getTurnoActivo,
  validarAcceso,
  registrarAcceso,
} from "../../../lib/api";
import { type Sesion, type RegistrarAccesoRequest } from "../../../lib/types";
import "../../globals.css";

// --- Iconos SVG ---
const BackArrowIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5 text-white">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
  </svg>
);

const CheckCircleIcon = () => (
  <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center shrink-0 border border-emerald-500/30 shadow-inner shadow-emerald-500/10">
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="w-5 h-5 text-emerald-400">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  </div>
);

const XCircleIcon = () => (
  <div className="w-10 h-10 bg-rose-500/20 rounded-full flex items-center justify-center shrink-0 border border-rose-500/30 shadow-inner shadow-rose-500/10">
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="w-5 h-5 text-rose-400">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  </div>
);

const SwitchCameraIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 10.5a3 3 0 1 1 6 0 3 3 0 0 1-6 0Z" />
  </svg>
);

export default function ScanQrPage() {
  const router = useRouter();
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [turnoActivo, setTurnoActivo] = useState<any>(null);
  const [loadingEstado, setLoadingEstado] = useState(true);

  // Estados de escaneo
  const [escaneando, setEscaneando] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [resultado, setResultado] = useState<any | null>(null);
  const [errorScan, setErrorScan] = useState<string | null>(null);

  const scannerRef = useRef<any>(null);
  const procesandoScanRef = useRef(false);
  const ultimoCodigoRef = useRef<string | null>(null);
  const ultimaHoraRef = useRef<number>(0);

  useEffect(() => {
    const s = cargarSesion();
    if (!s) {
      router.push("/login");
      return;
    }
    if (s.rol !== "vigilante") {
      router.push("/login");
      return;
    }
    setSesion(s);
    checkTurnoEstado();
  }, [router]);

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

  // Hook para controlar la cámara utilizando html5-qrcode
  useEffect(() => {
    if (!turnoActivo) return;

    let html5QrCode: any;

    // Importación dinámica para evitar errores de compilación SSR (window is not defined)
    import("html5-qrcode").then(({ Html5Qrcode }) => {
      html5QrCode = new Html5Qrcode("reader");
      scannerRef.current = html5QrCode;

      const startScanner = async () => {
        try {
          setCameraActive(false);
          await html5QrCode.start(
            { facingMode: facingMode },
            {
              fps: 10,
              qrbox: (width: number, height: number) => {
                const minSize = Math.min(width, height);
                const boxSize = Math.floor(minSize * 0.75);
                return { width: boxSize, height: boxSize };
              }
            },
            (decodedText: string) => {
              handleScan(decodedText);
            },
            () => {} // Ignorar fallos por frames vacíos
          );
          setCameraActive(true);
        } catch (err) {
          console.error("Error al iniciar cámara:", err);
          setErrorScan("No se pudo iniciar la cámara. Verifica los permisos de acceso.");
        }
      };

      startScanner();
    });

    return () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch((err: any) => console.error("Error deteniendo cámara:", err));
      }
    };
  }, [turnoActivo, facingMode]);

  // Manejar el resultado de la lectura del código QR
  const handleScan = async (codigo: string) => {
    // Evitar lecturas concurrentes y duplicadas rápidas
    if (procesandoScanRef.current) return;
    const ahoraMs = Date.now();
    if (ultimoCodigoRef.current === codigo && ahoraMs - ultimaHoraRef.current < 3000) {
      return;
    }
    
    procesandoScanRef.current = true;
    ultimoCodigoRef.current = codigo;
    ultimaHoraRef.current = ahoraMs;

    setEscaneando(true);
    setErrorScan(null);
    setResultado(null);

    try {
      // 1. Intentar obtener info del personal (solo para mostrar en UI).
      //    Si no existe, personal queda null y el backend registrará "denegado".
      let personal: Awaited<ReturnType<typeof validarAcceso>> | null = null;
      try {
        personal = await validarAcceso(codigo);
      } catch {
        // Código desconocido — se sigue al paso 2 para registrar el intento.
      }

      // 2. Derivar resultado:
      //    - Personal no encontrado → "denegado" (el backend lo fuerza también)
      //    - Visitante              → "pendiente" (espera aprobación del jefe)
      //    - Resto                  → "permitido"
      const resultadoAcceso = !personal
        ? "denegado"
        : personal.tipo.toLowerCase() === "visitante"
        ? "pendiente"
        : "permitido";

      // 3. Registrar siempre — el backend persiste el intento independientemente
      //    de si el código existe en personal o no.
      const data: RegistrarAccesoRequest = {
        codigo_institucional: codigo,
        modalidad: "QR",
        resultado: resultadoAcceso,
        observacion: personal ? "Ingreso registrado por QR" : undefined,
      };
      const registro = await registrarAcceso(data);

      // 4. Preparar estado de UI
      if (!personal) {
        setErrorScan("Código no registrado en el sistema. Intento registrado como denegado.");
        return;
      }

      const ahora = new Date();
      const horaFormateada = ahora.toLocaleTimeString("es-CO", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

      const iniciales = personal.nombre
        ? personal.nombre.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()
        : "P";

      const tipoPersonalMap: Record<string, string> = {
        visitante:           "Visitante",
        estudiante:          "Estudiante",
        docente:             "Docente",
        administrativo:      "Administrativo",
        admin:               "Administrativo",
        servicios_generales: "Servicios Generales",
      };

      setResultado({
        nombre: personal.nombre,
        tipo: tipoPersonalMap[personal.tipo.toLowerCase()] ?? personal.tipo,
        codigo: personal.codigo_institucional,
        credencial: "Vigente",
        hora: horaFormateada,
        iniciales: iniciales,
        resultado: registro.resultado,
        tipo_acceso: registro.tipo_acceso,
      });
    } catch (err: any) {
      setErrorScan(
        err?.message ?? "Error al procesar el acceso. Intente de nuevo."
      );
    } finally {
      setEscaneando(false);
      procesandoScanRef.current = false;
    }
  };

  // Reiniciar la cámara para realizar un nuevo escaneo
  const handleReiniciarScanner = async () => {
    setResultado(null);
    setErrorScan(null);
    setEscaneando(false);
    
    if (scannerRef.current) {
      try {
        if (!scannerRef.current.isScanning) {
          setCameraActive(false);
          await scannerRef.current.start(
            { facingMode: facingMode },
            {
              fps: 10,
              qrbox: (width: number, height: number) => {
                const minSize = Math.min(width, height);
                const boxSize = Math.floor(minSize * 0.75);
                return { width: boxSize, height: boxSize };
              }
            },
            (decodedText: string) => {
              handleScan(decodedText);
            },
            () => {}
          );
          setCameraActive(true);
        }
      } catch (err) {
        console.error("Error al reiniciar la cámara:", err);
        setErrorScan("No se pudo reiniciar la cámara.");
      }
    }
  };

  // Alternar entre cámara trasera y frontal
  function toggleCamera() {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  }

  if (!sesion || loadingEstado) {
    return (
      <div className="min-h-screen w-full bg-[#070c18] flex items-center justify-center">
        <span className="inline-block w-8 h-8 border-4 border-[#1b2a42] border-t-white rounded-full animate-spin"></span>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#070c18] text-slate-100 flex flex-col justify-between font-sans selection:bg-emerald-500/20">
      
      {/* Estilos CSS Inline para estructurar el video de html5-qrcode */}
      <style>{`
        #reader video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          border-radius: 28px;
        }
        #reader {
          width: 100% !important;
          height: 100% !important;
          border: none !important;
        }
        @keyframes scan-animation {
          0%, 100% { top: 4%; }
          50% { top: 96%; }
        }
        .scanner-laser {
          animation: scan-animation 2.2s infinite ease-in-out;
        }
      `}</style>

      {/* Cabecera / Top Bar */}
      <div className="py-5 px-6 border-b border-[#142035]/60 bg-[#070e1e]/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[420px] mx-auto w-full flex items-center gap-4">
          <button 
            onClick={() => router.push("/Mobile")} 
            className="p-2.5 hover:bg-[#1b2535] rounded-xl transition-all duration-200 active:scale-95 border border-[#1b2a42]"
            title="Volver"
          >
            <BackArrowIcon />
          </button>
          <h1 className="font-extrabold text-lg tracking-wide">Escanear QR</h1>
        </div>
      </div>

      {/* Contenido Principal */}
      <div className="flex-1 max-w-[420px] mx-auto w-full px-6 py-6 space-y-6">
        
        {/* Indicaciones */}
        <p className="text-xs text-slate-400 text-center leading-relaxed max-w-[280px] mx-auto">
          Apunta la cámara al código QR del carné institucional
        </p>

        {/* Visor de Escaneo de Cámara */}
        <div className="relative w-64 h-64 bg-[#091122] rounded-[36px] border border-[#1b2a42] shadow-inner mx-auto flex items-center justify-center overflow-hidden">
          
          {/* Elemento de lectura html5-qrcode */}
          <div id="reader" className="absolute inset-0"></div>

          {/* Estado de carga de cámara */}
          {!cameraActive && !resultado && !errorScan && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#091122] z-10 space-y-2">
              <span className="inline-block w-6 h-6 border-2 border-slate-600 border-t-white rounded-full animate-spin"></span>
              <span className="text-[10px] text-slate-400 font-bold uppercase">Cargando cámara...</span>
            </div>
          )}

          {/* Brackets / Esquineros del visor de escaneo */}
          <div className="absolute top-8 left-8 w-6 h-6 border-t-[3px] border-l-[3px] border-emerald-500 rounded-tl-lg z-20"></div>
          <div className="absolute top-8 right-8 w-6 h-6 border-t-[3px] border-r-[3px] border-emerald-500 rounded-tr-lg z-20"></div>
          <div className="absolute bottom-8 left-8 w-6 h-6 border-b-[3px] border-l-[3px] border-emerald-500 rounded-bl-lg z-20"></div>
          <div className="absolute bottom-8 right-8 w-6 h-6 border-b-[3px] border-r-[3px] border-emerald-500 rounded-br-lg z-20"></div>

          {/* Línea Láser del Escáner */}
          {cameraActive && !resultado && !errorScan && (
            <div className="absolute left-[10%] right-[10%] h-[3px] bg-emerald-500 shadow-[0_0_12px_3px_rgba(16,185,129,0.7)] rounded-full scanner-laser z-20"></div>
          )}
        </div>

        {/* Botón para alternar cámara (Frontal/Trasera) */}
        {turnoActivo && !resultado && !errorScan && (
          <div className="flex justify-center">
            <button
              onClick={toggleCamera}
              className="bg-[#0b1325] hover:bg-[#111c34] text-xs font-bold text-slate-300 px-4 py-2.5 rounded-xl border border-[#1b2a42] flex items-center gap-2 transition-all active:scale-95 shadow-sm"
            >
              <SwitchCameraIcon />
              <span>Usar cámara {facingMode === "environment" ? "frontal" : "trasera"}</span>
            </button>
          </div>
        )}

        {/* --- SECCIÓN DE RESULTADO --- */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-[1px] bg-[#142035]"></div>
            <span className="text-[11px] font-extrabold text-slate-500 tracking-wider uppercase select-none">Resultado</span>
            <div className="flex-1 h-[1px] bg-[#142035]"></div>
          </div>

          {/* Caso 1: Acceso Permitido */}
          {resultado && resultado.resultado === "permitido" && (
            <div className="space-y-4 animate-fadeIn">
              <div className="bg-[#125d3a]/25 border border-emerald-500/40 rounded-3xl p-4 flex items-center gap-4 shadow-md shadow-emerald-950/5">
                <CheckCircleIcon />
                <div className="flex flex-col">
                  <span className="font-extrabold text-base text-emerald-400 tracking-wide leading-tight">Acceso autorizado</span>
                  <span className="text-[11px] text-emerald-300/80 mt-1 leading-snug">Identidad verificada · Registro generado</span>
                </div>
              </div>
              <div className="bg-[#0b1325] border border-[#1b2a42] rounded-3xl p-5 shadow-lg space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#1b2a42] border border-[#2b3e5d] rounded-full flex items-center justify-center font-extrabold text-white text-base shadow-sm">
                    {resultado.iniciales}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-extrabold text-base text-white tracking-wide leading-tight">{resultado.nombre}</span>
                    <span className="text-xs text-slate-400 font-medium mt-1">{resultado.tipo} · Universidad de Cartagena</span>
                  </div>
                </div>
                <div className="border-t border-[#142035]/80 pt-4 space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-semibold">Código</span>
                    <span className="font-bold text-white tracking-wider font-mono">{resultado.codigo}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-semibold">Credencial</span>
                    <span className="font-extrabold text-emerald-400">{resultado.credencial}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-semibold">Hora</span>
                    <span className="font-bold text-white font-mono">{resultado.hora}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Caso 2: Acceso Pendiente (visitante — requiere aprobación del jefe) */}
          {resultado && resultado.resultado === "pendiente" && (
            <div className="space-y-4 animate-fadeIn">
              <div className="bg-amber-500/10 border border-amber-500/40 rounded-3xl p-4 flex items-center gap-4 shadow-md shadow-amber-950/5">
                <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center shrink-0 border border-amber-500/30">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5 text-amber-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                </div>
                <div className="flex flex-col">
                  <span className="font-extrabold text-base text-amber-400 tracking-wide leading-tight">Pendiente de aprobación</span>
                  <span className="text-[11px] text-amber-300/80 mt-1 leading-snug">Visitante · Requiere autorización del jefe</span>
                </div>
              </div>
              <div className="bg-[#0b1325] border border-[#1b2a42] rounded-3xl p-5 shadow-lg space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#1b2a42] border border-[#2b3e5d] rounded-full flex items-center justify-center font-extrabold text-white text-base shadow-sm">
                    {resultado.iniciales}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-extrabold text-base text-white tracking-wide leading-tight">{resultado.nombre}</span>
                    <span className="text-xs text-slate-400 font-medium mt-1">{resultado.tipo} · Universidad de Cartagena</span>
                  </div>
                </div>
                <div className="border-t border-[#142035]/80 pt-4 space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-semibold">Código</span>
                    <span className="font-bold text-white tracking-wider font-mono">{resultado.codigo}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-semibold">Estado</span>
                    <span className="font-extrabold text-amber-400">En espera</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-semibold">Hora</span>
                    <span className="font-bold text-white font-mono">{resultado.hora}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Caso 2: Acceso Denegado / Errores */}
          {errorScan && (
            <div className="space-y-4 animate-fadeIn">
              
              {/* Tarjeta de Error */}
              <div className="bg-rose-500/10 border border-rose-500/35 rounded-3xl p-4.5 flex items-center gap-4.5 shadow-md shadow-rose-950/5">
                <XCircleIcon />
                <div className="flex flex-col">
                  <span className="font-extrabold text-base text-rose-400 tracking-wide leading-tight">Acceso denegado</span>
                  <span className="text-[11px] text-rose-300/80 mt-1 leading-snug">{errorScan}</span>
                </div>
              </div>

            </div>
          )}

          {/* Sin escaneo y sin turno */}
          {!resultado && !errorScan && !turnoActivo && (
            <div className="bg-[#0b1325]/40 border border-[#1b2a42]/60 rounded-3xl p-6 text-center space-y-3">
              <span className="text-2xl block animate-bounce">⚠️</span>
              <h3 className="font-bold text-sm text-slate-300">Turno Requerido</h3>
              <p className="text-xs text-slate-400 leading-relaxed max-w-[260px] mx-auto">
                No se pueden validar accesos sin un turno activo en el sistema. Dirígete a la sección de turnos para iniciar tu jornada.
              </p>
              <button 
                onClick={() => router.push("/Mobile/Turnos")}
                className="mt-2 text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 rounded-xl transition-all active:scale-95"
              >
                Ir a Turnos
              </button>
            </div>
          )}

          {/* Sin escaneo, pero turno listo */}
          {!resultado && !errorScan && turnoActivo && !cameraActive && (
            <div className="border border-dashed border-[#142035] rounded-3xl p-6 text-center">
              <span className="text-xs text-slate-500">Iniciando cámara y escáner...</span>
            </div>
          )}

          {!resultado && !errorScan && turnoActivo && cameraActive && (
            <div className="border border-dashed border-[#10b981]/25 rounded-3xl p-6 text-center bg-[#10b981]/5">
              <span className="text-xs text-emerald-400 font-medium">Lector de QR en tiempo real activo. Coloque el carné frente a la cámara.</span>
            </div>
          )}

        </div>

      </div>

      {/* Footer */}
      <div className="py-4 text-center border-t border-[#142035] bg-[#070e1e]/40">
        <div className="max-w-[420px] mx-auto w-full">
          <span className="text-[9px] text-[#2c3d52] tracking-[0.15em] font-bold uppercase select-none">
            UD-Safe · Control de Acceso
          </span>
        </div>
      </div>

    </div>
  );
}
