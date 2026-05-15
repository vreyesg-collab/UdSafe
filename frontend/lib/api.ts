// ============================================================
// UdSafe — Cliente HTTP hacia el backend FastAPI
// ============================================================
// Uso:
//   import { registrarVigilante, login, refreshSesion, logout, getMe } from "./api";
// ============================================================

import type {
  RegistroVigilanteRequest,
  LoginRequest,
  TokenResponse,
  MeResponse,
  Sesion,
} from "./types";

// ------------------------------------------------------------
// Configuración base
// ------------------------------------------------------------

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

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
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...opciones.headers,
    },
    ...opciones,
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