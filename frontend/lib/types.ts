// ============================================================
// UdSafe — Tipos del dominio (sincronizados con el backend)
// ============================================================

// ------------------------------------------------------------
// Roles
// ------------------------------------------------------------

export type Rol = "vigilante" | "jefe_seguridad";

// ------------------------------------------------------------
// Requests → backend
// ------------------------------------------------------------

/** POST /registro/vigilante */
export interface RegistroVigilanteRequest {
  nombre: string;
  cedula: string;
  correo: string;
  password: string;
  turno: "mañana" | "tarde" | "noche";
}

/** POST /auth/registro/jefe */
export interface RegistroJefeRequest {
  nombre: string;
  cedula: string;
  correo: string;
  password: string;
  telefono: string;
}


/** POST /auth/login — aplica a vigilantes y jefes */
export interface LoginRequest {
  correo: string;
  password: string;
}

// ------------------------------------------------------------
// Responses ← backend
// ------------------------------------------------------------

/** Respuesta de registro/login/refresh */
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  rol: Rol;
  usuario_id: string;
  nombre: string;
}

/** GET /auth/me */
export interface MeResponse {
  usuario_id: string;
  correo: string;
  rol: Rol;
  nombre: string;
}

// ------------------------------------------------------------
// Sesión local (lo que guardamos en el cliente)
// ------------------------------------------------------------

export interface Sesion {
  accessToken: string;
  refreshToken: string;
  rol: Rol;
  usuarioId: string;
  nombre: string;
}

// ------------------------------------------------------------
// RBAC — utilidades de permisos
// ------------------------------------------------------------

/** Recursos protegidos conocidos */
export type Recurso =
  | "dashboard_jefe"
  | "gestionar_vigilantes"
  | "ver_reportes"
  | "registrar_ingreso"
  | "ver_historial_propio";

/** Mapa de permisos por rol */
export const PERMISOS: Record<Rol, Recurso[]> = {
  jefe_seguridad: [
    "dashboard_jefe",
    "gestionar_vigilantes",
    "ver_reportes",
    "registrar_ingreso",
    "ver_historial_propio",
  ],
  vigilante: ["registrar_ingreso", "ver_historial_propio"],
};

/** Comprueba si un rol tiene acceso a un recurso */
export function puedeAcceder(rol: Rol, recurso: Recurso): boolean {
  return PERMISOS[rol].includes(recurso);
}

// ------------------------------------------------------------
// Error estándar de la API
// ------------------------------------------------------------

export interface ApiError {
  detail: string;
}

// ------------------------------------------------------------
// Modelos de Control de Acceso
// ------------------------------------------------------------

export type Modalidad = "QR" | "Manual" | "Biometrico";

export type ResultadoAcceso = "pendiente" | "permitido" | "denegado";

export type TipoPersonal =
  | "visitante"
  | "estudiante"
  | "servicios_generales"
  | "administrativo"
  | "docente";

export interface ValidarAccesoResponse {
  id: string;
  codigo_institucional: string;
  nombre: string;
  tipo: string;
}

export interface RegistrarAccesoRequest {
  codigo_institucional: string;
  modalidad: Modalidad;
  resultado: ResultadoAcceso;
  observacion?: string;
}

export interface StatsHoyResponse {
  autorizados: number;
  denegados: number;
  alertas: number;
}

// ------------------------------------------------------------
// Biometría
// ------------------------------------------------------------

export interface BiometriaStatusResponse {
  tiene_biometria: boolean;
  id_personal: string;
  foto_referencia?: string;
}

export interface EnrollBiometriaResponse {
  id: string;
  id_personal: string;
  foto_referencia: string;
  created_at: string;
}

export interface VerificarBiometriaResponse {
  id_personal: string;
  codigo_institucional: string;
  nombre: string;
  tipo: string;
  distancia: number;
}

export interface AccesoResponse {
  id: string;
  id_personal: string;
  id_vigilante: string;
  modalidad: Modalidad;
  observacion?: string;
  tipo_acceso: "Normal" | "Especial";
  resultado: ResultadoAcceso;
  id_jefe_validador?: string;
  fecha_validacion?: string;
  created_at: string;
}

// ------------------------------------------------------------
// Dashboard de Métricas del Jefe de Seguridad
// ------------------------------------------------------------

// ── Acceso Especial (Visitantes) ─────────────────────────────────────────────

export interface CrearSolicitudEspecialRequest {
  nombre_visitante: string;
  cedula_visitante: string;
  motivo: string;
  porteria: string;
}

export interface DecisionSolicitudRequest {
  decision: "aprobada" | "denegada";
  vigencia?: "solo_hoy" | "esta_semana" | "permanente";
  observacion?: string;
}

export interface SolicitudHistorialItem {
  id: string;
  created_at: string;
  estado: string;
  vigencia?: string;
}

export interface RegistroAccesoEvento {
  id: string;
  nombre: string;
  tipo: string;
  codigo_institucional: string;
  modalidad: string;
  tipo_acceso: string;
  porteria: string;
  hora: string;
  created_at: string;
  estado: "Autorizado" | "Denegado" | "Especial";
  observacion?: string;
  foto_referencia?: string;
  foto_visitante?: string;
  id_jefe_validador?: string;
}

export interface SolicitudEspecial {
  id: string;
  numero?: number;
  nombre_visitante: string;
  cedula_visitante: string;
  motivo: string;
  porteria: string;
  estado: "pendiente" | "aprobada" | "denegada" | "cancelada";
  vigencia?: "solo_hoy" | "esta_semana" | "permanente";
  observacion_jefe?: string;
  id_vigilante: string;
  nombre_vigilante?: string;
  id_jefe?: string;
  nombre_jefe?: string;
  foto_visitante?: string;
  created_at: string;
  fecha_decision?: string;
  historial?: SolicitudHistorialItem[];
}

// ------------------------------------------------------------
// Alertas / Anomalías
// ------------------------------------------------------------

export type EstadoAlerta = "Activa" | "Resuelta";

export interface CrearAlertaRequest {
  asunto: string;
  descripcion: string;
}

export interface AlertaResponse {
  id: string;
  id_emisor: string;
  nombre_emisor: string | null;
  asunto: string;
  observaciones: string | null;
  estado: EstadoAlerta;
  fecha_hora: string;
}

// ------------------------------------------------------------
// Personal (gestión por el jefe)
// ------------------------------------------------------------

export interface PersonalItem {
  id: string;
  codigo_institucional: string;
  nombre: string;
  tipo: TipoPersonal;
  is_active: boolean;
  foto_referencia: string | null;
}

export interface PersonalDetalle {
  personal: PersonalItem;
  stats: { total: number; permitidos: number; denegados: number };
  accesos: AccesoResponse[];
}

// ------------------------------------------------------------
// Vigilantes (gestión por el jefe)
// ------------------------------------------------------------

export interface VigilanteInfo {
  id: string;
  nombre: string;
  cedula: string;
  correo: string;
  turno_activo: boolean;
}

export interface TurnoInfo {
  id: string;
  id_vigilante: string;
  nombre_vigilante: string | null;
  foto_inicio: string | null;
  foto_fin: string | null;
  estado: "activo" | "finalizado";
  observaciones: string | null;
  fecha_fin: string | null;
  created_at: string;
}

export interface ReglaAcceso {
  id: string;
  nombre: string | null;
  dias: string[];
  hora_inicio: string;
  hora_fin: string;
  tipos_permitidos: string[];
  activa: boolean;
  created_at: string;
}

export interface ReglaAccesoCreate {
  nombre?: string;
  dias: string[];
  hora_inicio: string;
  hora_fin: string;
  tipos_permitidos: string[];
  activa?: boolean;
}

export interface DashboardStatsResponse {
  total_accesos: number;
  autorizados: number;
  denegados: number;
  anomalias_activas: number;
  user_types: {
    label: string;
    count: number;
    pct: number;
    color: string;
  }[];
  hourly_flow: {
    hour: string;
    value: number;
  }[];
  events: {
    persona: string;
    tipo: string;
    metodo: string;
    porteria: string;
    hora: string;
    estado: "Autorizado" | "Denegado" | "Especial";
  }[];
}