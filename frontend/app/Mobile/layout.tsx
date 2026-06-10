"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getSolicitudEspecial } from "../../lib/api";
import { pedirPermisoNotificaciones, mostrarNotificacion } from "../../lib/notifications";

const SOLICITUD_KEY = "udsafe_solicitud_especial_id";

type BannerInfo = { tipo: "aprobada" | "denegada"; nombre: string };

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isOnEspeciales = pathname === "/Mobile/Especiales";

  const [banner, setBanner] = useState<BannerInfo | null>(null);
  const estadoPrevioRef = useRef<string | null>(null);

  // Solicitar permiso de notificaciones al montar
  useEffect(() => {
    pedirPermisoNotificaciones();
  }, []);

  // Polling en segundo plano — detecta cuando el jefe decide
  useEffect(() => {
    const poll = async () => {
      const id = localStorage.getItem(SOLICITUD_KEY);
      if (!id) {
        estadoPrevioRef.current = null;
        return;
      }

      try {
        const s = await getSolicitudEspecial(id);
        const anterior = estadoPrevioRef.current;

        if (anterior === "pendiente" && (s.estado === "aprobada" || s.estado === "denegada")) {
          if (s.estado === "aprobada") {
            mostrarNotificacion(`✅ Acceso aprobado — ${s.nombre_visitante}`, {
              body: "El jefe de seguridad autorizó el ingreso. Toca para ver.",
              tag: "especial-resultado",
            });
          } else {
            mostrarNotificacion(`❌ Acceso denegado — ${s.nombre_visitante}`, {
              body: "El jefe de seguridad rechazó la solicitud. Toca para ver.",
              tag: "especial-resultado",
            });
          }

          // Banner solo si el vigilante NO está ya en la página de Especiales
          if (!isOnEspeciales) {
            setBanner({ tipo: s.estado, nombre: s.nombre_visitante });
          }
        }

        estadoPrevioRef.current = s.estado;
      } catch {}
    };

    const intervalo = setInterval(poll, 5000);
    return () => clearInterval(intervalo);
  }, [isOnEspeciales]);

  // Limpiar banner cuando el vigilante navega a Especiales
  useEffect(() => {
    if (isOnEspeciales) setBanner(null);
  }, [isOnEspeciales]);

  return (
    <>
      {banner && (
        <div className="fixed top-0 inset-x-0 z-[200] flex justify-center px-4 pt-3 pointer-events-none">
          <div
            className={`w-full max-w-[420px] rounded-2xl shadow-2xl px-4 py-3.5 flex items-center gap-3 pointer-events-auto
              ${banner.tipo === "aprobada"
                ? "bg-emerald-600 text-white"
                : "bg-red-600 text-white"
              }`}
          >
            {/* Icono */}
            <div className="shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              {banner.tipo === "aprobada" ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              )}
            </div>

            {/* Texto */}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm leading-tight">
                {banner.tipo === "aprobada" ? "Acceso aprobado" : "Acceso denegado"}
              </p>
              <p className="text-xs opacity-85 truncate mt-0.5">{banner.nombre}</p>
            </div>

            {/* Ver */}
            <button
              onClick={() => {
                setBanner(null);
                router.push("/Mobile/Especiales");
              }}
              className="shrink-0 text-xs font-bold bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors"
            >
              Ver
            </button>

            {/* Cerrar */}
            <button
              onClick={() => setBanner(null)}
              className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
              aria-label="Cerrar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {children}
    </>
  );
}
