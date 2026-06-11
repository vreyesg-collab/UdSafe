"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { cargarSesion, getPersonalJefe, getDetallePersonal, toggleActivoPersonal, enrollBiometria } from "../../../lib/api";
import type { PersonalItem, PersonalDetalle, TipoPersonal, AccesoResponse } from "../../../lib/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

const TIPOS: { value: string; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "estudiante", label: "Estudiantes" },
  { value: "docente", label: "Docentes" },
  { value: "administrativo", label: "Administrativos" },
  { value: "servicios_generales", label: "Servicios generales" },
  { value: "visitante", label: "Visitantes" },
];

const TIPO_LABEL: Record<string, string> = {
  estudiante: "Estudiante",
  docente: "Docente",
  administrativo: "Administrativo",
  servicios_generales: "Servicios generales",
  visitante: "Visitante",
};

const TIPO_COLOR: Record<string, string> = {
  estudiante: "bg-blue-50 text-blue-700",
  docente: "bg-emerald-50 text-emerald-700",
  administrativo: "bg-amber-50 text-amber-700",
  servicios_generales: "bg-purple-50 text-purple-700",
  visitante: "bg-slate-100 text-slate-600",
};

function formatFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-CO", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function Initials({ nombre }: { nombre: string }) {
  const ini = nombre.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase() || "?";
  return (
    <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-sm font-bold shrink-0">
      {ini}
    </div>
  );
}

// ── Modal de enrolamiento biométrico ─────────────────────────────────────────

function EnrollModal({
  nombre,
  videoRef,
  camaraLista,
  enrollando,
  enrollError,
  onCapturar,
  onCancelar,
}: {
  nombre: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  camaraLista: boolean;
  enrollando: boolean;
  enrollError: string;
  onCapturar: () => void;
  onCancelar: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4" onClick={onCancelar}>
      <div
        className="bg-[#070c18] rounded-3xl w-full max-w-sm p-6 flex flex-col gap-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white font-bold text-sm">Registrar biometría</p>
            <p className="text-slate-400 text-xs mt-0.5 truncate max-w-[220px]">{nombre}</p>
          </div>
          <button
            onClick={onCancelar}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-xs text-slate-400 text-center -mt-1">
          Posiciona el rostro dentro del marco y captura
        </p>

        {/* Visor con guía facial */}
        <div className="relative w-64 h-64 bg-[#091122] rounded-[36px] border border-violet-500/30 shadow-inner mx-auto flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover rounded-[36px]"
            style={{ transform: "scaleX(-1)" }}
          />
          {!camaraLista && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#091122] z-10 space-y-2 rounded-[36px]">
              <span className="inline-block w-6 h-6 border-2 border-slate-600 border-t-white rounded-full animate-spin" />
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Cargando cámara...</span>
            </div>
          )}
          {/* Esquineros */}
          <div className="absolute top-8 left-8 w-6 h-6 border-t-[3px] border-l-[3px] border-violet-500 rounded-tl-lg z-20" />
          <div className="absolute top-8 right-8 w-6 h-6 border-t-[3px] border-r-[3px] border-violet-500 rounded-tr-lg z-20" />
          <div className="absolute bottom-8 left-8 w-6 h-6 border-b-[3px] border-l-[3px] border-violet-500 rounded-bl-lg z-20" />
          <div className="absolute bottom-8 right-8 w-6 h-6 border-b-[3px] border-r-[3px] border-violet-500 rounded-br-lg z-20" />
          {camaraLista && (
            <div className="absolute inset-[28px] rounded-full border-2 border-dashed border-violet-500 opacity-40 z-20" />
          )}
        </div>

        {enrollError && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 text-xs text-rose-300 text-center">
            {enrollError}
          </div>
        )}

        <button
          onClick={onCapturar}
          disabled={enrollando || !camaraLista}
          className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-bold text-sm py-3.5 rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        >
          {enrollando ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Procesando rostro...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 10.5a3 3 0 1 1 6 0 3 3 0 0 1-6 0Z" />
              </svg>
              Capturar y enrollar
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Panel de detalle ──────────────────────────────────────────────────────────

type PeriodoDetalle = "Hoy" | "Semana" | "Mes" | "Todos";

function DetallePanel({
  miembro,
  onClose,
  onToggle,
}: {
  miembro: PersonalItem;
  onClose: () => void;
  onToggle: (id: string) => void;
}) {
  const [detalle, setDetalle] = useState<PersonalDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [periodo, setPeriodo] = useState<PeriodoDetalle>("Mes");
  const [toggling, setToggling] = useState(false);
  const [fotoMaximizada, setFotoMaximizada] = useState(false);
  const [enrollFase, setEnrollFase] = useState<"idle" | "camara" | "exito">("idle");
  const [enrollando, setEnrollando] = useState(false);
  const [enrollError, setEnrollError] = useState("");
  const [camaraLista, setCamaraLista] = useState(false);
  const enrollVideoRef = useRef<HTMLVideoElement>(null);
  const enrollStreamRef = useRef<MediaStream | null>(null);

  // Detener cámara al desmontar
  useEffect(() => () => { enrollStreamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  // Arrancar cámara DESPUÉS de que React monte el <video> (cuando fase === "camara")
  useEffect(() => {
    if (enrollFase !== "camara") return;
    let cancelado = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        });
        if (cancelado) { stream.getTracks().forEach((t) => t.stop()); return; }
        enrollStreamRef.current = stream;
        if (enrollVideoRef.current) {
          enrollVideoRef.current.srcObject = stream;
          enrollVideoRef.current.onloadedmetadata = () => !cancelado && setCamaraLista(true);
        }
      } catch (err: any) {
        if (!cancelado) setEnrollError(err?.message || "No se pudo acceder a la cámara.");
      }
    })();
    return () => { cancelado = true; };
  }, [enrollFase]);

  function iniciarCamaraEnroll() {
    setEnrollError("");
    setCamaraLista(false);
    setEnrollFase("camara"); // el useEffect de arriba arranca la cámara una vez montado el <video>
  }

  function cancelarCamaraEnroll() {
    enrollStreamRef.current?.getTracks().forEach((t) => t.stop());
    enrollStreamRef.current = null;
    setCamaraLista(false);
    setEnrollFase("idle");
    setEnrollError("");
  }

  function capturarEnroll() {
    const video = enrollVideoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const foto = new File([blob], "face.jpg", { type: "image/jpeg" });
      try {
        setEnrollando(true);
        setEnrollError("");
        await enrollBiometria(miembro.id, foto);
        enrollStreamRef.current?.getTracks().forEach((t) => t.stop());
        enrollStreamRef.current = null;
        setCamaraLista(false);
        setEnrollFase("exito");
        cargar();
      } catch (err: any) {
        setEnrollError(err?.message || "Error al registrar la biometría.");
      } finally {
        setEnrollando(false);
      }
    }, "image/jpeg", 0.92);
  }

  const cargar = useCallback(async () => {
    try {
      setCargando(true);
      setDetalle(await getDetallePersonal(miembro.id, periodo));
    } catch { /* silenciar */ } finally {
      setCargando(false);
    }
  }, [miembro.id, periodo]);

  useEffect(() => { cargar(); }, [cargar]);

  async function handleToggle() {
    try {
      setToggling(true);
      await toggleActivoPersonal(miembro.id);
      onToggle(miembro.id);
    } finally {
      setToggling(false);
    }
  }

  const periodos: PeriodoDetalle[] = ["Hoy", "Semana", "Mes", "Todos"];
  const accesos: AccesoResponse[] = detalle?.accesos ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end" onClick={onClose}>
      <div
        className="relative h-full w-full max-w-xl bg-white shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center gap-3 z-10">
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
          <h2 className="text-sm font-bold text-slate-800 flex-1 truncate">{miembro.nombre}</h2>
          {/* Toggle activo */}
          <button
            onClick={handleToggle}
            disabled={toggling}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              miembro.is_active
                ? "bg-red-50 text-red-600 hover:bg-red-100"
                : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
            }`}
          >
            {toggling ? (
              <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : miembro.is_active ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                Deshabilitar
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                Habilitar
              </>
            )}
          </button>
        </div>

        <div className="px-5 py-5 flex flex-col gap-5">
          {/* Perfil */}
          <div className="flex gap-4 items-start">
            {miembro.foto_referencia ? (
              <button
                onClick={() => setFotoMaximizada(true)}
                className="relative w-20 h-20 rounded-2xl overflow-hidden border border-slate-200 shrink-0 group"
                title="Ver foto completa"
              >
                <img
                  src={miembro.foto_referencia}
                  alt={miembro.nombre}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                  <svg className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                  </svg>
                </div>
              </button>
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0">
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                </svg>
              </div>
            )}
            <div>
              <p className="text-base font-bold text-slate-800">{miembro.nombre}</p>
              <p className="text-xs text-slate-500 mt-0.5">{miembro.codigo_institucional}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_COLOR[miembro.tipo] ?? "bg-slate-100 text-slate-600"}`}>
                  {TIPO_LABEL[miembro.tipo] ?? miembro.tipo}
                </span>
                {miembro.is_active ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Activo
                  </span>
                ) : (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-xs font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    Deshabilitado
                  </span>
                )}
              </div>
              {!miembro.foto_referencia && (
                <p className="text-[11px] text-amber-600 mt-1.5 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                  Sin biometría enrollada
                </p>
              )}
            </div>
          </div>

          {/* Sección biometría */}
          <div className="border border-slate-100 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-700 mb-0.5">Biometría facial</p>
              {enrollFase === "exito" ? (
                <p className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  Registrada exitosamente
                </p>
              ) : (
                <p className="text-xs text-slate-400">
                  {miembro.foto_referencia
                    ? "Enrollada. Haz clic en «Actualizar» para reemplazarla."
                    : "Sin biometría. Enrola al miembro para habilitar acceso facial."}
                </p>
              )}
            </div>
            <button
              onClick={enrollFase === "exito" ? () => setEnrollFase("idle") : iniciarCamaraEnroll}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-xl font-semibold transition-colors ${
                enrollFase === "exito"
                  ? "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  : "bg-violet-50 text-violet-600 hover:bg-violet-100"
              }`}
            >
              {enrollFase === "exito" ? "Ok" : miembro.foto_referencia ? "Actualizar" : "Enrollar"}
            </button>
          </div>

          {/* Modal de cámara (fuera del panel, centrado en pantalla) */}
          {enrollFase === "camara" && (
            <EnrollModal
              nombre={miembro.nombre}
              videoRef={enrollVideoRef}
              camaraLista={camaraLista}
              enrollando={enrollando}
              enrollError={enrollError}
              onCapturar={capturarEnroll}
              onCancelar={cancelarCamaraEnroll}
            />
          )}

          {/* Filtro período */}
          <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5 w-fit">
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

          {cargando ? (
            <div className="flex justify-center py-8">
              <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Total accesos", value: detalle?.stats.total ?? 0, color: "text-slate-800" },
                  { label: "Permitidos", value: detalle?.stats.permitidos ?? 0, color: "text-emerald-600" },
                  { label: "Denegados", value: detalle?.stats.denegados ?? 0, color: "text-red-500" },
                ].map((s) => (
                  <div key={s.label} className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Historial */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Historial de accesos</p>
                {accesos.length === 0 ? (
                  <div className="bg-slate-50 rounded-xl p-6 text-center">
                    <p className="text-xs text-slate-400">Sin registros en el periodo seleccionado</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {accesos.map((a) => (
                      <div key={a.id} className="bg-slate-50 rounded-xl px-4 py-3 flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${a.resultado === "permitido" ? "bg-emerald-500" : a.resultado === "denegado" ? "bg-red-500" : "bg-amber-400"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-semibold capitalize ${a.resultado === "permitido" ? "text-emerald-700" : a.resultado === "denegado" ? "text-red-600" : "text-amber-600"}`}>
                              {a.resultado}
                            </span>
                            <span className="text-[11px] text-slate-400">·</span>
                            <span className="text-[11px] text-slate-500">{a.modalidad}</span>
                            <span className="text-[11px] text-slate-400">·</span>
                            <span className="text-[11px] text-slate-500">{a.tipo_acceso}</span>
                          </div>
                          {a.observacion && (
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">{a.observacion}</p>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 shrink-0">{formatFecha(a.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Lightbox foto */}
      {fotoMaximizada && miembro.foto_referencia && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-6"
          onClick={() => setFotoMaximizada(false)}
        >
          <div className="relative max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setFotoMaximizada(false)}
              className="absolute -top-10 right-0 text-white/70 hover:text-white text-sm flex items-center gap-1.5 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
              Cerrar
            </button>
            <img
              src={miembro.foto_referencia}
              alt={miembro.nombre}
              className="w-full rounded-2xl shadow-2xl"
            />
            <p className="text-center text-white/70 text-sm mt-3">{miembro.nombre}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PersonalPage() {
  const router = useRouter();
  const [personal, setPersonal] = useState<PersonalItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [filtrTipo, setFiltrTipo] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [busquedaDebounce, setBusquedaDebounce] = useState("");
  const [seleccionado, setSeleccionado] = useState<PersonalItem | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const sesion = cargarSesion();
    if (!sesion || sesion.rol !== "jefe_seguridad") router.replace("/login");
  }, [router]);

  const cargar = useCallback(async () => {
    try {
      setCargando(true);
      setError("");
      setPersonal(await getPersonalJefe({ tipo: filtrTipo, busqueda: busquedaDebounce }));
    } catch (e: any) {
      setError(e.message || "Error al cargar personal");
    } finally {
      setCargando(false);
    }
  }, [filtrTipo, busquedaDebounce]);

  useEffect(() => { cargar(); }, [cargar]);

  function handleBusqueda(valor: string) {
    setBusqueda(valor);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setBusquedaDebounce(valor), 400);
  }

  function handleToggleEnLista(id: string) {
    setPersonal((prev) =>
      prev.map((p) => (p.id === id ? { ...p, is_active: !p.is_active } : p))
    );
    setSeleccionado((prev) =>
      prev?.id === id ? { ...prev, is_active: !prev.is_active } : prev
    );
  }

  const activos = personal.filter((p) => p.is_active).length;
  const conFoto = personal.filter((p) => p.foto_referencia).length;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">Personal</h1>
        <p className="text-sm text-slate-500 mt-0.5">Miembros de la institución registrados en el sistema</p>
      </div>

      {/* Resumen */}
      {!cargando && personal.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total", value: personal.length, color: "text-slate-800" },
            { label: "Con acceso activo", value: activos, color: "text-emerald-600" },
            { label: "Deshabilitados", value: personal.length - activos, color: "text-red-500" },
            { label: "Con biometría", value: conFoto, color: "text-blue-600" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-4">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-5">
        {/* Búsqueda */}
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => handleBusqueda(e.target.value)}
            placeholder="Buscar por nombre..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Tipo */}
        <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5 flex-wrap">
          {TIPOS.map((t) => (
            <button
              key={t.value}
              onClick={() => setFiltrTipo(t.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${filtrTipo === t.value ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          onClick={cargar}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Actualizar
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm mb-4">{error}</div>
      )}

      {cargando ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : personal.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
          </div>
          <p className="text-sm text-slate-500">No se encontraron miembros del personal</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Miembro</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Código</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Acceso</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Biometría</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {personal.map((p) => (
                <tr
                  key={p.id}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => setSeleccionado(p)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {p.foto_referencia ? (
                        <img
                          src={p.foto_referencia}
                          alt={p.nombre}
                          className="w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0"
                        />
                      ) : (
                        <Initials nombre={p.nombre} />
                      )}
                      <span className="font-medium text-slate-800 truncate max-w-[160px]">{p.nombre}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs hidden sm:table-cell font-mono">{p.codigo_institucional}</td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_COLOR[p.tipo] ?? "bg-slate-100 text-slate-600"}`}>
                      {TIPO_LABEL[p.tipo] ?? p.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => {
                        setPersonal((prev) =>
                          prev.map((m) => (m.id === p.id ? { ...m, _toggling: true } : m))
                        );
                        toggleActivoPersonal(p.id)
                          .then(() => handleToggleEnLista(p.id))
                          .catch(() => {})
                          .finally(() =>
                            setPersonal((prev) =>
                              prev.map((m) => (m.id === p.id ? { ...m, _toggling: false } : m))
                            )
                          );
                      }}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${p.is_active ? "bg-emerald-500" : "bg-slate-300"}`}
                      title={p.is_active ? "Deshabilitar acceso" : "Habilitar acceso"}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${p.is_active ? "translate-x-4" : "translate-x-1"}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {p.foto_referencia ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                        </svg>
                        Enrollada
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Sin foto</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-slate-50">
            <p className="text-xs text-slate-400">{personal.length} miembro{personal.length !== 1 ? "s" : ""} · haz clic en una fila para ver el detalle</p>
          </div>
        </div>
      )}

      {/* Panel de detalle */}
      {seleccionado && (
        <DetallePanel
          miembro={seleccionado}
          onClose={() => setSeleccionado(null)}
          onToggle={handleToggleEnLista}
        />
      )}
    </div>
  );
}
