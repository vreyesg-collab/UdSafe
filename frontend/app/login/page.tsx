"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  login,
  logout,
  registrarVigilante,
  cargarSesion,
  limpiarSesion,
} from "../../lib/api";
import { PERMISOS, type Sesion, type Rol } from "../../lib/types";
import "../globals.css";

// ─── ICONOS SVG COMPONENTES (AUTOCONTENIDOS) ───────────────────────────────────

const LockIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
  </svg>
);

const UserIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
  </svg>
);

const CheckIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
  </svg>
);

const PowerIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1 0 12.728 0M12 3v9" />
  </svg>
);

const AlertIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
  </svg>
);

const UserPlusIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
  </svg>
);

const IdCardIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0Z" />
  </svg>
);

const EmailIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
  </svg>
);

export default function LoginPage() {
  const router = useRouter();
  // Estados generales
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estados: Formulario de Login
  const [rolSeleccionado, setRolSeleccionado] = useState<Rol>("vigilante");
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");

  // Estados: Formulario de Registro (Exclusivo Vigilante)
  const [regNombre, setRegNombre] = useState("");
  const [regCedula, setRegCedula] = useState("");
  const [regCorreo, setRegCorreo] = useState("");
  const [regPassword, setRegPassword] = useState("");

  // Efecto inicial: cargar sesión guardada
  useEffect(() => {
    const s = cargarSesion();
    if (s) {
      setSesion(s);
      setRolSeleccionado(s.rol);
      if (s.rol === "vigilante") {
        router.push("/Mobile");
      }
    }
  }, [router]);

  // Manejador de Login
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!correo.trim() || !password) {
      setError("Por favor, ingresa tus credenciales completas.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const s = await login({ correo: correo.trim(), password });
      setSesion(s);
      
      // Sincronizar selección de rol
      if (s.rol !== rolSeleccionado) {
        setRolSeleccionado(s.rol);
      }

      // Limpiar campos
      setCorreo("");
      setPassword("");

      // Redireccionar si es vigilante
      if (s.rol === "vigilante") {
        router.push("/Mobile");
      }
    } catch (err: any) {
      setError(err?.message || "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  // Manejador de Registro
  async function handleRegistro(e: React.FormEvent) {
    e.preventDefault();
    if (!regNombre.trim() || !regCedula.trim() || !regCorreo.trim() || !regPassword) {
      setError("Por favor completa todos los campos del formulario.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const s = await registrarVigilante({
        nombre: regNombre.trim(),
        cedula: regCedula.trim(),
        correo: regCorreo.trim(),
        password: regPassword,
        turno: "mañana",
      });
      setSesion(s);
      setRolSeleccionado("vigilante");

      // Limpiar campos y volver al estado inicial
      setRegNombre("");
      setRegCedula("");
      setRegCorreo("");
      setRegPassword("");
      setIsRegister(false);

      // Redireccionar a panel móvil
      router.push("/Mobile");
    } catch (err: any) {
      setError(err?.message || "Ocurrió un error al registrar el vigilante");
    } finally {
      setLoading(false);
    }
  }

  // Cerrar Sesión
  async function handleLogout() {
    try {
      await logout();
      setSesion(null);
    } catch (err: any) {
      limpiarSesion();
      setSesion(null);
    }
  }

  // Estilos dinámicos para Acentos (Solo aplica a login. El registro siempre es verde ya que es de vigilantes)
  const isVigilante = rolSeleccionado === "vigilante" || isRegister;
  
  const logoBg = isVigilante ? "bg-[#13633f]" : "bg-[#1d4ed8]";
  const logoShadow = isVigilante ? "shadow-emerald-950/40" : "shadow-blue-950/40";
  
  const inputFocusStyles = isVigilante 
    ? "focus:border-[#13633f] focus:ring-emerald-900/20" 
    : "focus:border-[#1d4ed8] focus:ring-blue-900/20";
    
  const buttonBg = isVigilante 
    ? "bg-[#13633f] hover:bg-[#187a4d] disabled:bg-[#13633f]/50" 
    : "bg-[#1d4ed8] hover:bg-[#2563eb] disabled:bg-[#1d4ed8]/50";

  return (
    <div className="min-h-screen w-full bg-[#070c18] text-slate-100 flex items-center justify-center p-6 font-sans">
      
      {/* Contenedor principal centrado, sin marco físico */}
      <div className="w-full max-w-[390px] flex flex-col justify-between py-8 px-2 min-h-[660px] animate-fadeIn">

        {sesion ? (
          /* PANTALLA 3: SESIÓN INICIADA (SIMULACIÓN DASHBOARD) */
          <div className="flex flex-col flex-1 justify-between py-4">
            
            {/* Perfil */}
            <div className="flex flex-col items-center text-center mt-3">
              <div className={`w-16 h-16 ${sesion.rol === "vigilante" ? "bg-[#13633f]" : "bg-[#1d4ed8]"} rounded-full flex items-center justify-center shadow-lg mb-4 text-white text-xl font-bold border-2 ${sesion.rol === "vigilante" ? "border-[#1c8355]/40" : "border-[#3b82f6]/40"} animate-pulse`}>
                {sesion.nombre.charAt(0).toUpperCase()}
              </div>
              <span className={`text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                sesion.rol === "jefe_seguridad" 
                  ? "bg-[#1e40af]/30 text-blue-400 border border-blue-950" 
                  : "bg-[#125d3a]/30 text-emerald-400 border border-emerald-950"
              }`}>
                {sesion.rol === "jefe_seguridad" ? "Jefe Seguridad" : "Vigilante"}
              </span>
              <h2 className="text-xl font-bold text-white mt-3 leading-snug">
                ¡Bienvenido,<br />{sesion.nombre}!
              </h2>
            </div>

            {/* Estado */}
            <div className="my-6 bg-[#0a0e19] rounded-2xl p-4 border border-[#141f32] space-y-3">
              <div className="flex justify-between items-center text-xs pb-2.5 border-b border-[#1b2a40]">
                <span className="text-[#4c607a]">ID de Usuario</span>
                <code className="text-slate-300 text-[10px] truncate max-w-[140px] font-mono">{sesion.usuarioId}</code>
              </div>
              <div className="flex justify-between items-center text-xs pt-1">
                <span className="text-[#4c607a]">Estado</span>
                <span className="text-emerald-500 font-bold flex items-center gap-1.5">
                  <CheckIcon className="w-3.5 h-3.5" />
                  Sesión activa
                </span>
              </div>
              <div className="mt-4 p-3 bg-[#0c1422] rounded-xl border border-[#1b2a42] text-center">
                <p className="text-[11px] text-[#5d7290] leading-relaxed">
                  Conexión segura establecida con Supabase Auth.
                </p>
              </div>
            </div>

            {/* Permisos según Rol */}
            <div className="space-y-3 mb-6">
              <div className="text-[10px] font-bold tracking-wider text-[#4c607a] uppercase mb-1">Permisos habilitados</div>
              <div className="flex flex-wrap gap-2">
                {PERMISOS[sesion.rol]?.map((perm) => (
                  <span key={perm} className="text-[10px] bg-[#101b2c] text-slate-300 px-2.5 py-1 rounded-lg border border-[#1a2d48]">
                    {perm}
                  </span>
                )) || <span className="text-xs text-slate-500">Ninguno</span>}
              </div>
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="w-full bg-[#162235] hover:bg-red-950/20 hover:text-red-400 hover:border-red-900/40 text-slate-300 font-bold py-3.5 rounded-2xl transition-all border border-[#21324c] active:scale-[0.98] transform flex items-center justify-center gap-2 mt-auto"
            >
              <PowerIcon className="w-4 h-4" />
              Cerrar Sesión
            </button>

          </div>
        ) : isRegister ? (
          /* PANTALLA 2: REGISTRO DE VIGILANTE */
          <div className="flex flex-col flex-1 justify-between">
            
            {/* Cabecera Registro */}
            <div className="flex flex-col items-center text-center mt-2">
              <div className={`w-18 h-18 ${logoBg} rounded-[22px] flex items-center justify-center shadow-lg ${logoShadow} mb-4 transition-all duration-300 hover:scale-105`}>
                <UserPlusIcon className="w-9 h-9 text-white" />
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white mb-1 font-sans">
                Registrar
              </h1>
              <p className="text-[13px] font-medium text-[#4c607a] leading-snug">
                Crear cuenta de Vigilante en UD-Safe
              </p>
            </div>

            {/* Formulario Registro */}
            <form onSubmit={handleRegistro} className="my-6 space-y-5">
              
              {/* Alerta de error */}
              {error && (
                <div className="flex items-start gap-2 bg-red-950/40 border border-red-900/60 p-3.5 rounded-2xl text-[12px] text-red-300 leading-snug animate-fadeIn">
                  <AlertIcon className="w-4.5 h-4.5 text-red-400 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Inputs */}
              <div className="space-y-4">
                
                {/* Nombre */}
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-[#4c607a]">
                    <UserIcon className="w-5 h-5" />
                  </span>
                  <input
                    type="text"
                    id="reg-nombre"
                    value={regNombre}
                    onChange={(e) => setRegNombre(e.target.value)}
                    placeholder="Nombre Completo"
                    className={`w-full bg-[#101b2c] border border-[#1b2a42] rounded-2xl py-4 pl-12 pr-4 text-base text-white placeholder-[#4c607a] focus:outline-none focus:ring-2 transition-all font-sans ${inputFocusStyles}`}
                    disabled={loading}
                    required
                  />
                </div>

                {/* Cédula */}
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-[#4c607a]">
                    <IdCardIcon className="w-5 h-5" />
                  </span>
                  <input
                    type="text"
                    id="reg-cedula"
                    value={regCedula}
                    onChange={(e) => setRegCedula(e.target.value)}
                    placeholder="Número de Cédula"
                    className={`w-full bg-[#101b2c] border border-[#1b2a42] rounded-2xl py-4 pl-12 pr-4 text-base text-white placeholder-[#4c607a] focus:outline-none focus:ring-2 transition-all font-sans ${inputFocusStyles}`}
                    disabled={loading}
                    required
                  />
                </div>

                {/* Correo */}
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-[#4c607a]">
                    <EmailIcon className="w-5 h-5" />
                  </span>
                  <input
                    type="email"
                    id="reg-correo"
                    value={regCorreo}
                    onChange={(e) => setRegCorreo(e.target.value)}
                    placeholder="Correo Institucional"
                    className={`w-full bg-[#101b2c] border border-[#1b2a42] rounded-2xl py-4 pl-12 pr-4 text-base text-white placeholder-[#4c607a] focus:outline-none focus:ring-2 transition-all font-sans ${inputFocusStyles}`}
                    disabled={loading}
                    required
                  />
                </div>

                {/* Contraseña */}
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-[#4c607a]">
                    <LockIcon className="w-5 h-5" />
                  </span>
                  <input
                    type="password"
                    id="reg-password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Contraseña"
                    className={`w-full bg-[#101b2c] border border-[#1b2a42] rounded-2xl py-4 pl-12 pr-4 text-base text-white placeholder-[#4c607a] focus:outline-none focus:ring-2 transition-all font-sans ${inputFocusStyles}`}
                    disabled={loading}
                    required
                  />
                </div>


              </div>

              {/* Botón Registrar */}
              <button
                type="submit"
                disabled={loading}
                className={`w-full ${buttonBg} disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl transition-all duration-300 shadow-lg active:scale-[0.98] transform flex items-center justify-center gap-2 mt-2`}
              >
                {loading ? (
                  <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                ) : (
                  "Registrar e ingresar"
                )}
              </button>

              {/* Link para volver */}
              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsRegister(false);
                    setError(null);
                  }}
                  className="text-xs font-bold text-[#5d7290] hover:text-white transition-colors"
                >
                  ¿Ya tienes cuenta? Inicia sesión
                </button>
              </div>

            </form>

            {/* Sello de Ubicación */}
            <div className="text-center mt-4">
              <span className="text-[10px] text-[#2c3d52] tracking-[0.12em] font-bold uppercase select-none">
                UNICARTAGENA · Sede Piedra de Bolívar
              </span>
            </div>

          </div>
        ) : (
          /* PANTALLA 1: INICIO DE SESIÓN */
          <div className="flex flex-col flex-1 justify-between">
            
            {/* Cabecera / Identidad */}
            <div className="flex flex-col items-center text-center mt-4">
              {/* Contenedor del Candado con Color de Acento Dinámico */}
              <div className={`w-18 h-18 ${logoBg} rounded-[22px] flex items-center justify-center shadow-lg ${logoShadow} mb-4 transition-all duration-300 hover:scale-105`}>
                <LockIcon className="w-9 h-9 text-white" />
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white mb-1.5 font-sans">
                UD-Safe
              </h1>
              <p className="text-[13px] font-medium text-[#4c607a] leading-snug">
                Universidad de Cartagena<br />
                Control de Acceso Digital
              </p>
            </div>

            {/* Formulario */}
            <form onSubmit={handleLogin} className="my-8 space-y-6">
              
              {/* Selector de Rol */}
              <div className="flex flex-col">
                <label className="text-[11px] font-semibold text-[#4c607a] mb-2 self-start tracking-wider uppercase">
                  Rol
                </label>
                <div className="grid grid-cols-2 gap-3.5 bg-[#0a0e19] p-1.5 rounded-2xl border border-[#141f32]">
                  <button
                    type="button"
                    id="btn-role-vigilante"
                    onClick={() => setRolSeleccionado("vigilante")}
                    className={`py-3.5 px-4 rounded-xl text-sm font-bold tracking-wide transition-all duration-300 ${
                      isVigilante
                        ? "bg-[#13633f] text-white shadow-md shadow-emerald-950/20"
                        : "text-[#5d7290] hover:text-slate-300"
                    }`}
                  >
                    Vigilante
                  </button>
                  <button
                    type="button"
                    id="btn-role-jefe"
                    onClick={() => setRolSeleccionado("jefe_seguridad")}
                    className={`py-3.5 px-4 rounded-xl text-sm font-bold tracking-wide transition-all duration-300 ${
                      !isVigilante
                        ? "bg-[#1d4ed8] text-white shadow-md shadow-blue-950/20"
                        : "text-[#5d7290] hover:text-slate-300"
                    }`}
                  >
                    Jefe Seg.
                  </button>
                </div>
              </div>

              {/* Inputs */}
              <div className="space-y-4">
                
                {/* Alerta de error local */}
                {error && (
                  <div className="flex items-start gap-2 bg-red-950/40 border border-red-900/60 p-3.5 rounded-2xl text-[12px] text-red-300 leading-snug animate-fadeIn">
                    <AlertIcon className="w-4.5 h-4.5 text-red-400 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Input: Usuario o Cédula */}
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-[#4c607a]">
                    <UserIcon className="w-5 h-5" />
                  </span>
                  <input
                    type="text"
                    id="login-username"
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                    placeholder="Usuario / Cédula"
                    className={`w-full bg-[#101b2c] border border-[#1b2a42] rounded-2xl py-4 pl-12 pr-4 text-base text-white placeholder-[#4c607a] focus:outline-none focus:ring-2 transition-all font-sans ${inputFocusStyles}`}
                    disabled={loading}
                    required
                  />
                </div>

                {/* Input: Contraseña */}
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-[#4c607a]">
                    <LockIcon className="w-5 h-5" />
                  </span>
                  <input
                    type="password"
                    id="login-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Contraseña"
                    className={`w-full bg-[#101b2c] border border-[#1b2a42] rounded-2xl py-4 pl-12 pr-4 text-base text-white placeholder-[#4c607a] focus:outline-none focus:ring-2 transition-all font-sans ${inputFocusStyles}`}
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              {/* Botón Ingresar */}
              <button
                type="submit"
                id="btn-login-submit"
                disabled={loading}
                className={`w-full ${buttonBg} disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl transition-all duration-300 shadow-lg active:scale-[0.98] transform flex items-center justify-center gap-2 mt-2`}
              >
                {loading ? (
                  <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                ) : (
                  "Ingresar al sistema"
                )}
              </button>

              {/* Link para registro */}
              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsRegister(true);
                    setError(null);
                  }}
                  className="text-xs font-bold text-[#5d7290] hover:text-white transition-colors"
                >
                  Registra un vigilante
                </button>
              </div>

            </form>

            {/* Sello de Ubicación */}
            <div className="text-center mt-4">
              <span className="text-[10px] text-[#2c3d52] tracking-[0.12em] font-bold uppercase select-none">
                UNICARTAGENA · Sede Piedra de Bolívar
              </span>
            </div>

          </div>
        )}
      </div>

    </div>
  );
}