"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { cargarSesion, logout, limpiarSesion, getTurnoActivo, getStatsHoy, getAlertasActivas } from "../../lib/api";
import { tocarAlarma } from "../../lib/notifications";
import { type Sesion, type StatsHoyResponse, type AlertaResponse } from "../../lib/types";
import "../globals.css";

// ─── ICONOS SVG AUXILIARES ────────────────────────────────────────────────────

const CheckGreenIcon = () => (
  <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mb-3">
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-6 h-6 text-green-600">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  </div>
);

const RedXIcon = () => (
  <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mb-3">
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-6 h-6 text-red-600">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  </div>
);

const ClockOrangeIcon = () => (
  <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mb-3">
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.2" stroke="currentColor" className="w-6 h-6 text-amber-600">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  </div>
);

// Iconos de Acciones con su caja de color
const QrIconBox = () => (
  <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mb-4 border border-green-100">
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" className="w-7 h-7 text-green-700">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 14v3m0 0v3m0-3h3m-3 0h-3" />
    </svg>
  </div>
);

const FacialIconBox = () => (
  <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-4 border border-blue-100">
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" className="w-7 h-7 text-blue-700">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  </div>
);

const AnomalyIconBox = () => (
  <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mb-4 border border-red-100">
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" className="w-7 h-7 text-red-700">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
  </div>
);

const SpecialIconBox = () => (
  <div className="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center mb-4 border border-purple-100">
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" className="w-7 h-7 text-purple-700">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  </div>
);

export default function MobileDashboardPage() {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [turnoActivo, setTurnoActivo] = useState<any>(null);
  const [stats, setStats] = useState<StatsHoyResponse>({ autorizados: 0, denegados: 0, alertas: 0 });
  const [alertasActivas, setAlertasActivas] = useState<AlertaResponse[]>([]);
  const alarmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevAlertCountRef = useRef(0);
  const [modalSinTurno, setModalSinTurno] = useState(false);
  const [rutaPendiente, setRutaPendiente] = useState<string | null>(null);
  const router = useRouter();

  function handleAccion(ruta: string) {
    if (!turnoActivo) {
      setRutaPendiente(ruta);
      setModalSinTurno(true);
      return;
    }
    router.push(ruta);
  }

  useEffect(() => {
    const s = cargarSesion();
    if (!s) {
      router.push("/login");
    } else if (s.rol !== "vigilante") {
      console.log("Acceso no autorizado para rol:", s.rol);
      router.push("/login");
    } else {
      setSesion(s);
      getTurnoActivo()
        .then((active) => setTurnoActivo(active))
        .catch((err) => console.error("Error al obtener turno:", err));
      getStatsHoy()
        .then((s) => setStats(s))
        .catch((err) => console.error("Error al obtener stats:", err));
      // Cargar alertas activas inicialmente
      getAlertasActivas()
        .then((a) => setAlertasActivas(a))
        .catch(() => {});
    }
  }, [router]);

  // Polling de alertas activas cada 20s
  useEffect(() => {
    const intervalo = setInterval(() => {
      getAlertasActivas()
        .then((a) => setAlertasActivas(a))
        .catch(() => {});
    }, 20000);
    return () => clearInterval(intervalo);
  }, []);

  // Sonido + borde cuando hay alertas activas
  useEffect(() => {
    const count = alertasActivas.length;
    if (count > prevAlertCountRef.current) {
      tocarAlarma();
      if (!alarmIntervalRef.current) {
        alarmIntervalRef.current = setInterval(tocarAlarma, 8000);
      }
    } else if (count === 0 && alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    prevAlertCountRef.current = count;
  }, [alertasActivas]);

  useEffect(() => {
    return () => {
      if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current);
    };
  }, []);

  async function handleLogout() {
    try {
      await logout();
      router.push("/login");
    } catch {
      limpiarSesion();
      router.push("/login");
    }
  }

  if (!sesion) return null;

  // Obtener iniciales del nombre
  const iniciales = sesion.nombre
    ? sesion.nombre.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()
    : "V";

  return (
    <div className="min-h-screen w-full bg-[#f8fafc] text-slate-800 flex flex-col justify-between font-sans">

      {/* Keyframes para el borde de alerta */}
      <style>{`
        @keyframes alertBorderFlash {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.05; }
        }
      `}</style>

      {/* Borde rojo intermitente cuando hay alertas activas */}
      {alertasActivas.length > 0 && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            zIndex: 99999,
            boxShadow: "inset 0 0 0 8px #ef4444",
            animation: "alertBorderFlash 0.7s ease-in-out infinite",
          }}
        />
      )}

      {/* Cabecera / Top Bar (Ancho Completo) */}
      <div className="bg-[#070e1e] py-6 px-6 text-white shadow-md">
        <div className="max-w-[420px] mx-auto w-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Iniciales Avatar */}
            <div className="w-12 h-12 bg-[#125d3a] rounded-full flex items-center justify-center font-bold text-white text-base border border-emerald-500/20 shadow-md">
              {iniciales}
            </div>
            
            {/* Info Vigilante */}
            <div className="flex flex-col">
              <span className="font-bold text-base tracking-tight leading-tight">{sesion.nombre}</span>
              <span className="text-xs text-[#5d7290] font-medium mt-0.5">Vigilante · Portería principal</span>
            </div>
          </div>

          {/* Badge Turno Activo & Cerrar Sesión */}
          <div className="flex items-center gap-2">
            {turnoActivo ? (
              <button
                onClick={() => router.push("/Mobile/Turnos")}
                className="bg-[#125d3a] hover:bg-[#1c7e52] text-white text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-wider shadow-sm transition-all duration-200 hover:scale-105 active:scale-95"
                title="Gestionar Turno Activo"
              >
                Turno activo
              </button>
            ) : (
              <button
                onClick={() => router.push("/Mobile/Turnos")}
                className="bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-wider shadow-sm transition-all duration-200 hover:scale-105 active:scale-95"
                title="Iniciar Turno de Guardia"
              >
                Sin turno
              </button>
            )}
            
            {/* Logout rápido */}
            <button 
              onClick={handleLogout} 
              className="p-1.5 bg-[#1b2535] hover:bg-red-950/20 hover:text-red-400 rounded-full text-slate-400 transition-colors"
              title="Cerrar sesión"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Contenido Principal (Centrado de forma responsiva) */}
      <div className="flex-1 max-w-[420px] mx-auto w-full px-6 py-6 space-y-6">

        {/* Banner de alertas activas */}
        {alertasActivas.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shrink-0" />
              <p className="text-sm font-bold text-red-800">
                {alertasActivas.length === 1
                  ? "1 alerta de seguridad activa"
                  : `${alertasActivas.length} alertas de seguridad activas`}
              </p>
            </div>
            <div className="space-y-1">
              {alertasActivas.slice(0, 3).map((a) => (
                <div key={a.id} className="flex items-start gap-2 text-xs text-red-700">
                  <span className="shrink-0 mt-0.5">⚠️</span>
                  <span>
                    <span className="font-semibold">{a.asunto}</span>
                    {a.nombre_emisor && <span className="text-red-500"> · {a.nombre_emisor}</span>}
                  </span>
                </div>
              ))}
              {alertasActivas.length > 3 && (
                <p className="text-xs text-red-500 pl-5">+{alertasActivas.length - 3} más...</p>
              )}
            </div>
          </div>
        )}

        {/* SECCIÓN 1: HOY */}
        <div className="space-y-3.5">
          <h2 className="text-xs font-bold text-slate-400 tracking-widest uppercase">Hoy</h2>
          
          <div className="grid grid-cols-3 gap-3.5">
            
            {/* Autorizados */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col items-center justify-center text-center transition-all hover:scale-105 duration-200">
              <CheckGreenIcon />
              <span className="text-2xl font-extrabold text-slate-800 tracking-tight leading-none">{stats.autorizados}</span>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mt-1.5">Autorizados</span>
            </div>

            {/* Denegados */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col items-center justify-center text-center transition-all hover:scale-105 duration-200">
              <RedXIcon />
              <span className="text-2xl font-extrabold text-slate-800 tracking-tight leading-none">{stats.denegados}</span>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mt-1.5">Denegados</span>
            </div>

            {/* Alertas */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col items-center justify-center text-center transition-all hover:scale-105 duration-200">
              <ClockOrangeIcon />
              <span className="text-2xl font-extrabold text-slate-800 tracking-tight leading-none">{stats.alertas}</span>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mt-1.5">Alertas</span>
            </div>

          </div>
        </div>

        {/* SECCIÓN 2: ACCIONES */}
        <div className="space-y-3.5">
          <h2 className="text-xs font-bold text-slate-400 tracking-widest uppercase">Acciones</h2>
          
          <div className="grid grid-cols-2 gap-4">
            
            {/* Escanear QR */}
            <button
              onClick={() => handleAccion("/Mobile/Scan_qr")}
              className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 flex flex-col items-center justify-center text-center transition-all duration-200 hover:shadow-md hover:border-slate-200 active:scale-[0.98] transform group"
            >
              <QrIconBox />
              <span className="font-bold text-sm text-slate-800 leading-tight">Escanear QR</span>
              <span className="text-[11px] font-medium text-slate-400 mt-1">Leer carné institucional</span>
            </button>

            {/* Biometría facial */}
            <button
              onClick={() => handleAccion("/Mobile/Biometria")}
              className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 flex flex-col items-center justify-center text-center transition-all duration-200 hover:shadow-md hover:border-slate-200 active:scale-[0.98] transform group"
            >
              <FacialIconBox />
              <span className="font-bold text-sm text-slate-800 leading-tight">Biometría facial</span>
              <span className="text-[11px] font-medium text-slate-400 mt-1">Verificar identidad visual</span>
            </button>

            {/* Reportar anomalía */}
            <button
              onClick={() => handleAccion("/Mobile/Anomalia")}
              className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 flex flex-col items-center justify-center text-center transition-all duration-200 hover:shadow-md hover:border-slate-200 active:scale-[0.98] transform group"
            >
              <AnomalyIconBox />
              <span className="font-bold text-sm text-slate-800 leading-tight">Reportar anomalía</span>
              <span className="text-[11px] font-medium text-slate-400 mt-1">Registrar situación irregular</span>
            </button>

            {/* Acceso especial */}
            <button
              onClick={() => handleAccion("/Mobile/Especiales")}
              className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 flex flex-col items-center justify-center text-center transition-all duration-200 hover:shadow-md hover:border-slate-200 active:scale-[0.98] transform group"
            >
              <SpecialIconBox />
              <span className="font-bold text-sm text-slate-800 leading-tight">Acceso especial</span>
              <span className="text-[11px] font-medium text-slate-400 mt-1">Solicitar al jefe</span>
            </button>

          </div>
        </div>

      </div>

      {/* Sello de Ubicación / Footer (Ancho Completo) */}
      <div className="py-4 text-center border-t border-slate-200 bg-slate-50">
        <div className="max-w-[420px] mx-auto w-full">
          <span className="text-[9px] text-[#94a3b8] tracking-[0.15em] font-bold uppercase select-none">
            UD-Safe · Control de Acceso
          </span>
        </div>
      </div>

      {/* Modal: sin turno activo */}
      {modalSinTurno && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm px-4 pb-8">
          <div className="w-full max-w-[420px] bg-white rounded-3xl shadow-2xl p-6 space-y-5 animate-fadeIn">

            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-14 h-14 bg-amber-50 border border-amber-100 rounded-2xl flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-7 h-7 text-amber-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <div>
                <p className="font-extrabold text-base text-slate-800">Sin turno activo</p>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                  Debes iniciar un turno antes de usar esta función. ¿Quieres ir al apartado de turnos?
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => {
                  setModalSinTurno(false);
                  router.push("/Mobile/Turnos");
                }}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm py-3.5 rounded-2xl transition-all active:scale-95"
              >
                Ir a Turnos
              </button>
              <button
                onClick={() => {
                  setModalSinTurno(false);
                  setRutaPendiente(null);
                }}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm py-3.5 rounded-2xl transition-all active:scale-95"
              >
                Cancelar
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
