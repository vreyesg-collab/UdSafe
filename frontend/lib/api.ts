// ============================================================
// UdSafe — Cliente HTTP hacia el backend FastAPI
// ============================================================
// Uso:
//   import { registrarVigilante, login, refreshSesion, logout, getMe } from "./api";
// ============================================================

import type {
  RegistroVigilanteRequest,
  RegistroJefeRequest,
  LoginRequest,
  TokenResponse,
  MeResponse,
  Sesion,
  ValidarAccesoResponse,
  RegistrarAccesoRequest,
  AccesoResponse,
  StatsHoyResponse,
  BiometriaStatusResponse,
  EnrollBiometriaResponse,
  VerificarBiometriaResponse,
  DashboardStatsResponse,
  CrearSolicitudEspecialRequest,
  DecisionSolicitudRequest,
  SolicitudEspecial,
  RegistroAccesoEvento,
} from "./types";

// ------------------------------------------------------------
// Configuración base
// ------------------------------------------------------------

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Clave usada para persistir la sesión en localStorage
const SESION_KEY = "udsafe_sesion";

// ------------------------------------------------------------
// Helpers internos
// ------------------------------------------------------------

/**
 * Wrapper sobre fetch que lanza un Error con el `detail`
 * que devuelve FastAPI cuando el status no es 2xx.
 */
async function peticion<T>(
  path: string,
  opciones: RequestInit = {}
): Promise<T> {
  const { headers: opcionesHeaders, ...restoOpciones } = opciones;
  const headers: Record<string, string> = {};
  if (!(restoOpciones.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      ...headers,
      ...(opcionesHeaders as Record<string, string>),
    },
    ...restoOpciones,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error desconocido" }));
    throw new Error((err as { detail: string }).detail ?? "Error desconocido");
  }

  // 204 No Content no trae body
  if (res.status === 204) return undefined as unknown as T;

  return res.json() as Promise<T>;
}

/** Devuelve el header Authorization usando la sesión guardada. */
function authHeader(): Record<string, string> {
  const sesion = cargarSesion();
  if (!sesion) return {};
  return { Authorization: `Bearer ${sesion.accessToken}` };
}

// ------------------------------------------------------------
// Persistencia de sesión (localStorage)
// ------------------------------------------------------------

/** Convierte un TokenResponse a Sesion y la guarda localmente. */
export function guardarSesion(token: TokenResponse): Sesion {
  const sesion: Sesion = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    rol: token.rol,
    usuarioId: token.usuario_id,
    nombre: token.nombre,
  };
  localStorage.setItem(SESION_KEY, JSON.stringify(sesion));
  return sesion;
}

/** Lee la sesión guardada, o null si no existe. */
export function cargarSesion(): Sesion | null {
  const raw = localStorage.getItem(SESION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Sesion;
  } catch {
    return null;
  }
}

/** Elimina la sesión del almacenamiento local. */
export function limpiarSesion(): void {
  localStorage.removeItem(SESION_KEY);
}

// ------------------------------------------------------------
// Endpoints de autenticación
// ------------------------------------------------------------

/**
 * POST /registro/vigilante
 * Registra un nuevo vigilante y guarda la sesión automáticamente.
 */
export async function registrarVigilante(
  data: RegistroVigilanteRequest
): Promise<Sesion> {
  const token = await peticion<TokenResponse>("/registro/vigilante", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return guardarSesion(token);
}

/**
 * POST /auth/registro/jefe
 * Registra un nuevo jefe de seguridad y guarda la sesión automáticamente.
 */
export async function registrarJefe(
  data: RegistroJefeRequest
): Promise<Sesion> {
  const token = await peticion<TokenResponse>("/auth/registro/jefe", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return guardarSesion(token);
}

/**
 * POST /auth/login
 * Inicia sesión (vigilante o jefe_seguridad) y guarda la sesión.
 */
export async function login(data: LoginRequest): Promise<Sesion> {
  const token = await peticion<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return guardarSesion(token);
}

/**
 * POST /auth/refresh
 * Renueva el access_token usando el refresh_token guardado.
 * Lanza un error si no hay sesión activa.
 */
export async function refreshSesion(): Promise<Sesion> {
  const sesion = cargarSesion();
  if (!sesion) throw new Error("No hay sesión activa para renovar");

  const token = await peticion<TokenResponse>(
    `/auth/refresh?refresh_token=${encodeURIComponent(sesion.refreshToken)}`,
    { method: "POST" }
  );
  return guardarSesion(token);
}

/**
 * POST /auth/logout
 * Cierra sesión en el servidor y limpia el almacenamiento local.
 */
export async function logout(): Promise<void> {
  await peticion<void>("/auth/logout", {
    method: "POST",
    headers: authHeader(),
  }).catch(() => {
    // Si el token ya expiró no importa, limpiamos igual
  });
  limpiarSesion();
}

/**
 * GET /auth/me
 * Devuelve los datos del usuario autenticado actualmente.
 */
export async function getMe(): Promise<MeResponse> {
  return peticion<MeResponse>("/auth/me", {
    headers: authHeader(),
  });
}

// ------------------------------------------------------------
// Endpoints de turnos
// ------------------------------------------------------------


/**
 * POST /turnos/iniciar
 * Inicia el turno de un vigilante subiendo la foto de entrada.
 */
export async function iniciarTurno(
  foto: File,
  observaciones?: string
): Promise<any> {
  const formData = new FormData();
  formData.append("foto", foto);
  if (observaciones) {
    formData.append("observaciones", observaciones);
  }

  return peticion<any>("/turnos/iniciar", {
    method: "POST",
    headers: authHeader(),
    body: formData,
  });
}

/**
 * POST /turnos/finalizar
 * Finaliza el turno de un vigilante subiendo la foto de salida.
 */
export async function finalizarTurno(
  foto: File,
  observaciones?: string
): Promise<any> {
  const formData = new FormData();
  formData.append("foto", foto);
  if (observaciones) {
    formData.append("observaciones", observaciones);
  }

  return peticion<any>("/turnos/finalizar", {
    method: "POST",
    headers: authHeader(),
    body: formData,
  });
}

/**
 * GET /turnos/activo
 * Obtiene el turno activo del vigilante, o null si no tiene.
 */
export async function getTurnoActivo(): Promise<any> {
  return peticion<any>("/turnos/activo", {
    headers: authHeader(),
  });
}

 // ------------------------------------------------------------          
    // Endpoints de Control de Acceso                                        
    // ------------------------------------------------------------          
                                                                             
    /**                                                                      
     * GET /acceso/validar/{codigo_institucional}                            
     * Valida la existencia y estado de un miembro de personal por su código 
  institucional.                                                             
     */                                                                      
    export async function validarAcceso(                                     
      codigoInstitucional: string                                            
    ): Promise<ValidarAccesoResponse> {                                      
      return peticion<ValidarAccesoResponse>(                                
        `/acceso/validar/${encodeURIComponent(codigoInstitucional)}`,        
        {                                                                    
          method: "GET",                                                     
          headers: authHeader(),                                             
        }                                                                    
      );                                                                     
    }                                                                        
                                                                             
/**
 * POST /acceso/registrar
 * Registra el ingreso o salida del personal en la base de datos.
 */
export async function registrarAcceso(
  data: RegistrarAccesoRequest
): Promise<AccesoResponse> {
  return peticion<AccesoResponse>("/acceso/registrar", {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify(data),
  });
}

/**
 * GET /acceso/stats/hoy
 * Devuelve los conteos de autorizados, denegados y alertas activas del día.
 */
export async function getStatsHoy(): Promise<StatsHoyResponse> {
  return peticion<StatsHoyResponse>("/acceso/stats/hoy", {
    headers: authHeader(),
  });
}

// ------------------------------------------------------------
// Endpoints de Biometría
// ------------------------------------------------------------

/**
 * GET /personal/{id}/biometria
 * Consulta si el personal ya tiene biometría registrada.
 */
export async function estadoBiometria(idPersonal: string): Promise<BiometriaStatusResponse> {
  return peticion<BiometriaStatusResponse>(`/personal/${idPersonal}/biometria`, {
    headers: authHeader(),
  });
}

/**
 * POST /personal/{id}/biometria/enroll
 * Registra la biometría facial de un miembro del personal.
 */
export async function enrollBiometria(
  idPersonal: string,
  foto: File
): Promise<EnrollBiometriaResponse> {
  const formData = new FormData();
  formData.append("foto", foto);
  return peticion<EnrollBiometriaResponse>(`/personal/${idPersonal}/biometria/enroll`, {
    method: "POST",
    headers: authHeader(),
    body: formData,
  });
}

/**
 * POST /acceso/biometrico/verificar
 * Identifica a una persona por su biometría facial.
 */
export async function verificarBiometrico(foto: File): Promise<VerificarBiometriaResponse> {
  const formData = new FormData();
  formData.append("foto", foto);
  return peticion<VerificarBiometriaResponse>("/acceso/biometrico/verificar", {
    method: "POST",
    headers: authHeader(),
    body: formData,
  });
}

// ------------------------------------------------------------
// Endpoints de Acceso Especial (Visitantes)
// ------------------------------------------------------------

export async function crearSolicitudEspecial(
  data: CrearSolicitudEspecialRequest,
  foto: File
): Promise<SolicitudEspecial> {
  const formData = new FormData();
  formData.append("nombre_visitante", data.nombre_visitante);
  formData.append("cedula_visitante", data.cedula_visitante);
  formData.append("motivo", data.motivo);
  formData.append("porteria", data.porteria);
  formData.append("foto", foto);
  return peticion<SolicitudEspecial>("/acceso/especial", {
    method: "POST",
    headers: authHeader(),
    body: formData,
  });
}

export async function getSolicitudEspecial(id: string): Promise<SolicitudEspecial> {
  return peticion<SolicitudEspecial>(`/acceso/especial/${id}`, {
    headers: authHeader(),
  });
}

export async function cancelarSolicitudEspecial(id: string): Promise<void> {
  return peticion<void>(`/acceso/especial/${id}/cancelar`, {
    method: "POST",
    headers: authHeader(),
  });
}

export async function getSolicitudesEspeciales(estado = "pendiente"): Promise<SolicitudEspecial[]> {
  return peticion<SolicitudEspecial[]>(`/jefe/accesos/especiales?estado=${encodeURIComponent(estado)}`, {
    headers: authHeader(),
  });
}

export async function getSolicitudEspecialDetalle(id: string): Promise<SolicitudEspecial> {
  return peticion<SolicitudEspecial>(`/jefe/accesos/especiales/${id}`, {
    headers: authHeader(),
  });
}

export async function getRegistroAccesos(
  periodo = "Hoy",
  estado = "todos"
): Promise<RegistroAccesoEvento[]> {
  return peticion<RegistroAccesoEvento[]>(
    `/jefe/accesos/registro?periodo=${encodeURIComponent(periodo)}&estado=${encodeURIComponent(estado)}`,
    { headers: authHeader() }
  );
}

export async function decidirSolicitudEspecial(
  id: string,
  data: DecisionSolicitudRequest
): Promise<SolicitudEspecial> {
  return peticion<SolicitudEspecial>(`/jefe/accesos/especiales/${id}/decision`, {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify(data),
  });
}

/**
 * GET /jefe/dashboard/stats
 * Obtiene las estadísticas y eventos agregados para el panel de control del jefe de seguridad.
 */
export async function getJefeDashboardStats(
  periodo: string = "Hoy"
): Promise<DashboardStatsResponse> {
  return peticion<DashboardStatsResponse>(
    `/jefe/dashboard/stats?period=${encodeURIComponent(periodo)}`,
    {
      method: "GET",
      headers: authHeader(),
    }
  );
}
