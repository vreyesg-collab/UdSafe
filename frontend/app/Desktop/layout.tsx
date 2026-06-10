"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { PowerIcon } from "lucide-react";
import { logout, cargarSesion, getSolicitudesEspeciales } from "../../lib/api";
import type { Sesion } from "../../lib/types";
import { pedirPermisoNotificaciones, mostrarNotificacion } from "../../lib/notifications";

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
function Sidebar({ open, onClose, pendientes }: { open: boolean; onClose: () => void; pendientes: number }) {
  const router = useRouter();
  const pathname = usePathname();

  const navItems: { section: string; items: NavItem[] }[] = [
    {
      section: "ACCESOS",
      items: [
        { label: "Métricas", href: "/Desktop" },
        { label: "Accesos especiales", href: "/Desktop/Especiales", badge: pendientes || undefined },
        { label: "Registro de eventos", href: "/Desktop/Registro_eventos" },
      ],
    },
    {
      section: "REPORTES",
      items: [{ label: "Generar reporte", href: "/Desktop/Reportes" }, { label: "Exportar datos" }],
    },
    {
      section: "SEGURIDAD",
      items: [{ label: "Anomalías", badge: 2 }, { label: "Vigilantes" }],
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
    "Exportar datos": (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    ),
    Anomalías: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    Vigilantes: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
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
  const [panelAbierto, setPanelAbierto] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const prevPendientesRef = useRef<number | null>(null);
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
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} pendientes={pendientes} />
        <main className="flex-1 px-4 py-6 lg:px-8 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
