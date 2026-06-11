"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cargarSesion, getVigilantes, getTurnosJefe, crearVigilanteJefe } from "../../../lib/api";
import type { VigilanteInfo, TurnoInfo } from "../../../lib/types";

type Tab = "personal" | "turnos" | "registrar";
type PeriodoTurno = "Hoy" | "Semana" | "Mes" | "Todos";
type EstadoTurno = "todos" | "activo" | "finalizado";

function formatFecha(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-CO", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function duracion(inicio: string, fin: string | null): string {
  if (!fin) return "En curso";
  const diff = new Date(fin).getTime() - new Date(inicio).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Tab: Personal ─────────────────────────────────────────────────────────────
function TabPersonal() {
  const [vigilantes, setVigilantes] = useState<VigilanteInfo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    try {
      setCargando(true);
      setError("");
      setVigilantes(await getVigilantes());
    } catch (e: any) {
      setError(e.message || "Error al cargar vigilantes");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const activos = vigilantes.filter((v) => v.turno_activo).length;

  return (
    <div>
      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs text-slate-500 mb-1">Total vigilantes</p>
          <p className="text-2xl font-bold text-slate-800">{vigilantes.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs text-slate-500 mb-1">En turno ahora</p>
          <p className="text-2xl font-bold text-emerald-600">{activos}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs text-slate-500 mb-1">Sin turno activo</p>
          <p className="text-2xl font-bold text-slate-400">{vigilantes.length - activos}</p>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex justify-end mb-4">
        <button
          onClick={cargar}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Actualizar
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm mb-4">{error}</div>
      )}

      {cargando ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : vigilantes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          </div>
          <p className="text-sm text-slate-500">No hay vigilantes registrados</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Nombre</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Cédula</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Correo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {vigilantes.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
                        {v.nombre.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase() || "?"}
                      </div>
                      <span className="font-medium text-slate-800">{v.nombre}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">{v.cedula || "—"}</td>
                  <td className="px-4 py-3 text-slate-500 hidden md:table-cell text-xs">{v.correo}</td>
                  <td className="px-4 py-3">
                    {v.turno_activo ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        En turno
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-medium">
                        Sin turno
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab: Turnos ───────────────────────────────────────────────────────────────
function TabTurnos() {
  const [turnos, setTurnos] = useState<TurnoInfo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [periodo, setPeriodo] = useState<PeriodoTurno>("Hoy");
  const [estado, setEstado] = useState<EstadoTurno>("todos");
  const [fotoModal, setFotoModal] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setCargando(true);
      setError("");
      setTurnos(await getTurnosJefe({ periodo, estado }));
    } catch (e: any) {
      setError(e.message || "Error al cargar turnos");
    } finally {
      setCargando(false);
    }
  }, [periodo, estado]);

  useEffect(() => { cargar(); }, [cargar]);

  const periodos: PeriodoTurno[] = ["Hoy", "Semana", "Mes", "Todos"];
  const activos = turnos.filter((t) => t.estado === "activo").length;

  return (
    <div>
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5">
          {periodos.map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${periodo === p ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5">
          {(["todos", "activo", "finalizado"] as EstadoTurno[]).map((e) => (
            <button
              key={e}
              onClick={() => setEstado(e)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${estado === e ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {e === "todos" ? "Todos" : e === "activo" ? "Activos" : "Finalizados"}
            </button>
          ))}
        </div>
        <button
          onClick={cargar}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Actualizar
        </button>
      </div>

      {/* Resumen rápido */}
      {!cargando && turnos.length > 0 && (
        <div className="flex gap-3 mb-4">
          <div className="bg-emerald-50 rounded-xl px-4 py-2 text-sm">
            <span className="font-semibold text-emerald-700">{activos}</span>
            <span className="text-emerald-600 ml-1">activo{activos !== 1 ? "s" : ""}</span>
          </div>
          <div className="bg-slate-100 rounded-xl px-4 py-2 text-sm">
            <span className="font-semibold text-slate-700">{turnos.length - activos}</span>
            <span className="text-slate-500 ml-1">finalizado{turnos.length - activos !== 1 ? "s" : ""}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm mb-4">{error}</div>
      )}

      {cargando ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : turnos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
          <p className="text-sm text-slate-500">No hay turnos para el periodo seleccionado.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Vigilante</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Inicio</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Fin</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Duración</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Fotos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {turnos.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-[10px] font-bold shrink-0">
                        {(t.nombre_vigilante || "?").split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
                      </div>
                      <span className="font-medium text-slate-800 text-xs">{t.nombre_vigilante || "—"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {t.estado === "activo" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                        Finalizado
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs hidden sm:table-cell">{formatFecha(t.created_at)}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell">{formatFecha(t.fecha_fin)}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs hidden lg:table-cell">{duracion(t.created_at, t.fecha_fin)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      {t.foto_inicio && (
                        <button onClick={() => setFotoModal(t.foto_inicio!)} title="Foto inicio" className="w-7 h-7 rounded-lg overflow-hidden border border-slate-200 hover:opacity-80 transition-opacity">
                          <img src={t.foto_inicio} alt="inicio" className="w-full h-full object-cover" />
                        </button>
                      )}
                      {t.foto_fin && (
                        <button onClick={() => setFotoModal(t.foto_fin!)} title="Foto fin" className="w-7 h-7 rounded-lg overflow-hidden border border-slate-200 hover:opacity-80 transition-opacity">
                          <img src={t.foto_fin} alt="fin" className="w-full h-full object-cover" />
                        </button>
                      )}
                      {!t.foto_inicio && !t.foto_fin && <span className="text-slate-300 text-xs">—</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal foto */}
      {fotoModal && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setFotoModal(null)}
        >
          <div className="relative max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setFotoModal(null)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white text-sm"
            >
              Cerrar ✕
            </button>
            <img src={fotoModal} alt="Foto turno" className="w-full rounded-2xl shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Registrar ────────────────────────────────────────────────────────────
function TabRegistrar() {
  const [form, setForm] = useState({ nombre: "", cedula: "", correo: "", password: "", confirmar: "" });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");

  function campo(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((f) => ({ ...f, [key]: e.target.value }));
      setError("");
      setExito("");
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim() || !form.cedula.trim() || !form.correo.trim() || !form.password) {
      setError("Completa todos los campos.");
      return;
    }
    if (form.password !== form.confirmar) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (form.password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    try {
      setEnviando(true);
      setError("");
      const nuevo = await crearVigilanteJefe({
        nombre: form.nombre.trim(),
        cedula: form.cedula.trim(),
        correo: form.correo.trim(),
        password: form.password,
        turno: "mañana",
      });
      setExito(`Vigilante "${nuevo.nombre}" registrado exitosamente.`);
      setForm({ nombre: "", cedula: "", correo: "", password: "", confirmar: "" });
    } catch (err: any) {
      setError(err.message || "Error al registrar vigilante");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="max-w-lg">
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <h2 className="text-base font-semibold text-slate-800 mb-1">Nuevo vigilante</h2>
        <p className="text-xs text-slate-500 mb-5">Crea las credenciales de acceso para un nuevo miembro del personal de seguridad.</p>

        {exito && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl p-3 text-sm mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            {exito}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm mb-4">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Nombre completo</label>
            <input
              type="text"
              value={form.nombre}
              onChange={campo("nombre")}
              placeholder="Ej: Carlos Pérez Martínez"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Número de cédula</label>
            <input
              type="text"
              value={form.cedula}
              onChange={campo("cedula")}
              placeholder="Ej: 1085123456"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Correo institucional</label>
            <input
              type="email"
              value={form.correo}
              onChange={campo("correo")}
              placeholder="vigilante@udcartagena.edu.co"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Contraseña</label>
              <input
                type="password"
                value={form.password}
                onChange={campo("password")}
                placeholder="Mín. 6 caracteres"
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Confirmar contraseña</label>
              <input
                type="password"
                value={form.confirmar}
                onChange={campo("confirmar")}
                placeholder="Repetir contraseña"
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={enviando}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {enviando ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Registrando...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
                </svg>
                Crear vigilante
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function VigilantesPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("personal");

  useEffect(() => {
    const sesion = cargarSesion();
    if (!sesion || sesion.rol !== "jefe_seguridad") {
      router.replace("/login");
    }
  }, [router]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: "personal",
      label: "Personal",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
        </svg>
      ),
    },
    {
      id: "turnos",
      label: "Turnos",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      ),
    },
    {
      id: "registrar",
      label: "Registrar",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
        </svg>
      ),
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">Vigilantes</h1>
        <p className="text-sm text-slate-500 mt-0.5">Gestión del personal de seguridad</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-2xl p-1 mb-6 w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === t.id
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "personal" && <TabPersonal />}
      {tab === "turnos" && <TabTurnos />}
      {tab === "registrar" && <TabRegistrar />}
    </div>
  );
}
