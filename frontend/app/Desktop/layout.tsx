"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { PowerIcon } from "lucide-react";
import { logout, cargarSesion, getSolicitudesEspeciales, getAlertas } from "../../lib/api";
import type { Sesion } from "../../lib/types";
import { pedirPermisoNotificaciones, mostrarNotificacion, tocarAlarma } from "../../lib/notifications";

// ─── Types ───────────────────────────────────────────────────────────────────
type NavItem = { label: string; href?: string; badge?: number };

type Notificacion = {
  id: string;
  titulo: string;
  cuerpo: string;
  timestamp: Date;
  leida: boolean;
  href: string;
};

function formatRelativo(fecha: Date): string {
  const diff = Math.floor((Date.now() - fecha.getTime()) / 1000);
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return fecha.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

// ─── Sidebar Component ───────────────────────────────────────────────────────
function Sidebar({ open, onClose, pendientes, alertasActivas }: { open: boolean; onClose: () => void; pendientes: number; alertasActivas: number }) {
  const router = useRouter();
  const pathname = usePathname();

  const navItems: { section: string; items: NavItem[] }[] = [
    {
      section: "ACCESOS",
      items: [
        { label: "Métricas", href: "/Desktop" },
        { label: "Accesos especiales", href: "/Desktop/Especiales", badge: pendientes || undefined },
        { label: "Registro de eventos", href: "/Desktop/Registro_eventos" },
        { label: "Personal", href: "/Desktop/Personal" },
      ],
    },
    {
      section: "REPORTES",
      items: [{ label: "Generar reporte", href: "/Desktop/Reportes" }],
    },
    {
      section: "DATOS",
      items: [{ label: "Importar datos", href: "/Desktop/Importar" }],
    },
    {
      section: "SEGURIDAD",
      items: [
        { label: "Anomalías", href: "/Desktop/Alertas", badge: alertasActivas || undefined },
        { label: "Vigilantes", href: "/Desktop/Vigilantes" },
        { label: "Reglas de CA", href: "/Desktop/ReglasCA" },
      ],
    },
  ];

  const icons: Record<string, React.ReactNode> = {
    Métricas: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13h4v7H3v-7zm6-6h4v13H9V7zm6-4h4v17h-4V3z" />
      </svg>
    ),
    "Accesos especiales": (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    ),
    "Registro de eventos": (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
    "Generar reporte": (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    "Importar datos": (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
      </svg>
    ),
    Personal: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
      </svg>
    ),
    Anomalías: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
      </svg>
    ),
    Vigilantes: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    "Reglas de CA": (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
      </svg>
    ),
  };

  return (
    <>
      {/* Overlay for mobile */}
      {open && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={onClose} />}

      <aside
        className={`
          fixed top-0 left-0 h-full w-56 bg-white border-r border-slate-100 z-40 flex flex-col pt-16
          transition-transform duration-300
          ${open ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0 lg:static lg:h-auto lg:z-auto lg:pt-0
        `}
      >
        <nav className="flex flex-col gap-6 px-3 py-6 overflow-y-auto">
          {navItems.map((section) => (
            <div key={section.section}>
              <p className="text-[10px] font-bold text-slate-400 tracking-widest px-3 mb-2">{section.section}</p>
              {section.items.map((item) => {
                const isActive = item.href
                  ? item.href === "/Desktop"
                    ? pathname === "/Desktop"
                    : pathname.startsWith(item.href)
                  : false;
                return (
                  <button
                    key={item.label}
                    onClick={() => item.href && router.push(item.href)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all mb-0.5
                      ${isActive
                        ? "bg-blue-50 text-blue-700"
                        : item.href
                          ? "text-slate-600 hover:bg-slate-50 hover:text-slate-800 cursor-pointer"
                          : "text-slate-400 cursor-not-allowed opacity-60"
                      }`}
                  >
                    <span className={isActive ? "text-blue-600" : "text-slate-400"}>
                      {icons[item.label]}
                    </span>
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.badge && (
                      <span className="bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}

// ─── Layout Component ────────────────────────────────────────────────────────
export default function DesktopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [pendientes, setPendientes] = useState(0);
  const [alertasActivas, setAlertasActivas] = useState(0);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const prevPendientesRef = useRef<number | null>(null);
  const prevAlertasRef = useRef<number | null>(null);
  const alarmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const notifPanelRef = useRef<HTMLDivElement>(null);

  const noLeidas = notificaciones.filter((n) => !n.leida).length;

  useEffect(() => {
    setSesion(cargarSesion());
    pedirPermisoNotificaciones();
  }, []);

  // Cerrar panel al hacer clic fuera
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (notifPanelRef.current && !notifPanelRef.current.contains(e.target as Node)) {
        setPanelAbierto(false);
      }
    }
    if (panelAbierto) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [panelAbierto]);

  // Polling para nuevas solicitudes de acceso especial pendientes
  useEffect(() => {
    const poll = async () => {
      try {
        const lista = await getSolicitudesEspeciales("pendiente");
        const total = lista.length;
        const prev = prevPendientesRef.current;

        if (prev !== null && total > prev) {
          const nuevas = total - prev;
          const label = `${nuevas} nueva${nuevas > 1 ? "s" : ""} solicitud${nuevas > 1 ? "es" : ""} de acceso especial`;
          mostrarNotificacion(`🔔 ${label}`, {
            body: "Un vigilante requiere tu autorización",
            tag: "nueva-solicitud-especial",
          });
          setNotificaciones((prev) => [
            {
              id: crypto.randomUUID(),
              titulo: label,
              cuerpo: "Un vigilante requiere tu autorización",
              timestamp: new Date(),
              leida: false,
              href: "/Desktop/Especiales",
            },
            ...prev,
          ].slice(0, 30));
        }

        prevPendientesRef.current = total;
        setPendientes(total);
      } catch {}
    };

    const intervalo = setInterval(poll, 10000);
    return () => clearInterval(intervalo);
  }, []);

  // Polling de alertas activas (extraído para poder llamarlo on-demand)
  const pollAlertas = useCallback(async () => {
    try {
      const lista = await getAlertas({ estado: "Activa", periodo: "Hoy" });
      const total = lista.length;
      const prev = prevAlertasRef.current;

      if (prev !== null && total > prev) {
        const nuevas = total - prev;
        const label = `${nuevas} nueva${nuevas > 1 ? "s" : ""} alerta${nuevas > 1 ? "s" : ""} de seguridad`;
        mostrarNotificacion(`🚨 ${label}`, {
          body: "Un vigilante reportó una anomalía",
          tag: "nueva-alerta-seguridad",
        });
        setNotificaciones((prev) => [
          {
            id: crypto.randomUUID(),
            titulo: label,
            cuerpo: "Un vigilante reportó una anomalía",
            timestamp: new Date(),
            leida: false,
            href: "/Desktop/Alertas",
          },
          ...prev,
        ].slice(0, 30));
      }

      prevAlertasRef.current = total;
      setAlertasActivas(total);
    } catch {}
  }, []);

  useEffect(() => {
    const intervalo = setInterval(pollAlertas, 10000);
    return () => clearInterval(intervalo);
  }, [pollAlertas]);

  // Escucha el evento emitido al resolver una alerta para actualizar inmediatamente
  useEffect(() => {
    const handler = () => pollAlertas();
    window.addEventListener("udsafe:alertaResuelta", handler);
    return () => window.removeEventListener("udsafe:alertaResuelta", handler);
  }, [pollAlertas]);

  // Sonido de alarma mientras haya alertas activas
  useEffect(() => {
    if (alertasActivas > 0) {
      tocarAlarma();
      if (!alarmIntervalRef.current) {
        alarmIntervalRef.current = setInterval(tocarAlarma, 8000);
      }
    } else {
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
        alarmIntervalRef.current = null;
      }
    }
  }, [alertasActivas]);

  useEffect(() => {
    return () => {
      if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current);
    };
  }, []);

  const nombre = sesion?.nombre ?? "";
  const iniciales = nombre
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase() || "JS";

  async function handleLogout() {
    try {
      await logout();
      router.push("/login");
    } catch (err) {
      router.push("/login");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">

      {/* Keyframes para el borde de alerta */}
      <style>{`
        @keyframes alertBorderFlash {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.05; }
        }
      `}</style>

      {/* Borde rojo intermitente cuando hay alertas activas */}
      {alertasActivas > 0 && (
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

      {/* ── Topbar ── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-slate-900 h-14 flex items-center px-4 gap-4 shadow-lg">
        {/* Mobile hamburger */}
        <button
          className="lg:hidden text-white p-1.5 rounded-lg hover:bg-white/10"
          onClick={() => setSidebarOpen(true)}
          aria-label="Abrir menú"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2.5 min-w-fit">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-md">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <span className="text-white font-bold text-base tracking-tight">UD-Safe</span>
        </div>

        {/* Nav links — hidden on mobile */}
        <nav className="hidden lg:flex items-center gap-1 ml-4">
          {[
            { label: "Panel", href: "/Desktop" },
            { label: "Métricas", href: "/Desktop" },
            { label: "Accesos especiales", href: "/Desktop/Especiales" },
          ].map((item) => {
            const isActive = item.href === "/Desktop"
              ? pathname === "/Desktop"
              : pathname.startsWith(item.href);
            return (
              <button
                key={item.label}
                onClick={() => router.push(item.href)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                  ${isActive
                    ? "bg-white/15 text-white"
                    : "text-slate-400 hover:text-white hover:bg-white/10"
                  }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {/* Logout */}
          <button 
            onClick={handleLogout}
            className="relative w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-white/10 rounded-lg transition-colors" 
            aria-label="Cerrar sesión"
          >
            <PowerIcon className="w-4.5 h-4.5" />
          </button>
          
          {/* Notification bell + panel */}
          <div className="relative" ref={notifPanelRef}>
            <button
              onClick={() => {
                setPanelAbierto((p) => !p);
                // Marcar como leídas al abrir
                setNotificaciones((prev) => prev.map((n) => ({ ...n, leida: true })));
              }}
              className="relative w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Notificaciones"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {noLeidas > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                  {noLeidas > 9 ? "9+" : noLeidas}
                </span>
              )}
            </button>

            {panelAbierto && (
              <div className="absolute right-0 top-11 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-[60]">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-800">Notificaciones</h3>
                  {notificaciones.length > 0 && (
                    <button
                      onClick={() => setNotificaciones([])}
                      className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      Limpiar
                    </button>
                  )}
                </div>

                {/* List */}
                <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-50">
                  {notificaciones.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-3">
                      <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                      </div>
                      <p className="text-xs text-slate-400 font-medium">Sin notificaciones por ahora</p>
                    </div>
                  ) : (
                    notificaciones.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => {
                          setPanelAbierto(false);
                          router.push(n.href);
                        }}
                        className="w-full text-left px-4 py-3.5 hover:bg-slate-50 transition-colors flex gap-3 items-start"
                      >
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-800 leading-snug">{n.titulo}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{n.cuerpo}</p>
                          <p className="text-[10px] text-slate-400 mt-1">{formatRelativo(n.timestamp)}</p>
                        </div>
                        <svg className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
                        </svg>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Avatar */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow">
              {iniciales}
            </div>
            <div className="hidden md:block">
              <p className="text-white text-xs font-semibold leading-tight">{nombre || "—"}</p>
              <p className="text-blue-400 text-[10px]">Jefe de Seguridad</p>
            </div>
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex pt-14">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} pendientes={pendientes} alertasActivas={alertasActivas} />
        <main className="flex-1 px-4 py-6 lg:px-8 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
