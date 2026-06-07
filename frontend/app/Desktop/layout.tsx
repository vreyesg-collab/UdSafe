"use client";

import { useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────
type NavItem = { label: string; active?: boolean; badge?: number };

// ─── Sidebar Component ───────────────────────────────────────────────────────
function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navItems: { section: string; items: NavItem[] }[] = [
    {
      section: "ACCESOS",
      items: [{ label: "Métricas", active: true }, { label: "Registro de eventos" }, { label: "Historial" }],
    },
    {
      section: "REPORTES",
      items: [{ label: "Generar reporte" }, { label: "Exportar datos" }],
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
    "Registro de eventos": (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
    Historial: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    "Generar reporte": (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
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
              {section.items.map((item) => (
                <button
                  key={item.label}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all mb-0.5
                    ${item.active
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                    }`}
                >
                  <span className={item.active ? "text-blue-600" : "text-slate-400"}>
                    {icons[item.label]}
                  </span>
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.badge && (
                    <span className="bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
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
          {["Panel", "Métricas", "Reportes", "Usuarios", "Configuración"].map((item) => (
            <button
              key={item}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${item === "Métricas"
                  ? "bg-white/15 text-white"
                  : "text-slate-400 hover:text-white hover:bg-white/10"
                }`}
            >
              {item}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {/* Notification */}
          <button className="relative w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" aria-label="Notificaciones">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </button>

          {/* Avatar */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow">
              RS
            </div>
            <div className="hidden md:block">
              <p className="text-white text-xs font-semibold leading-tight">Rafael Sánchez</p>
              <p className="text-blue-400 text-[10px]">Jefe de Seguridad</p>
            </div>
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex pt-14">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 px-4 py-6 lg:px-8 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
