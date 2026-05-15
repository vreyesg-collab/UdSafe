"use client";

import { useState, useEffect } from "react";
import {
  registrarVigilante,
  login,
  refreshSesion,
  logout,
  getMe,
  cargarSesion,
  limpiarSesion,
} from "../../lib/api";
import { puedeAcceder, PERMISOS, type Sesion, type Recurso } from "../../lib/types";
import "../globals.css";

// ─── tipos locales ────────────────────────────────────────────────────────────

interface LogEntry {
  ts: string;
  ok: boolean;
  data: unknown;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function timestamp() {
  return new Date().toLocaleTimeString("es-CO");
}

function usarLog() {
  const [entry, setEntry] = useState<LogEntry | null>(null);
  const ok  = (data: unknown) => setEntry({ ts: timestamp(), ok: true,  data });
  const err = (e: unknown)    => setEntry({ ts: timestamp(), ok: false, data: e instanceof Error ? e.message : String(e) });
  return { entry, ok, err };
}

// ─── sub-componentes de UI ────────────────────────────────────────────────────

function SesionBar({ sesion }: { sesion: Sesion | null }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px",
      borderRadius:8, border:"0.5px solid #ccc", marginBottom:16, fontSize:12,
      background:"#f5f5f5", flexWrap:"wrap" }}>
      <strong>Estado:</strong>
      {sesion
        ? <span style={{ color:"green" }}>✓ Autenticado</span>
        : <span style={{ color:"#888" }}>Sin sesión</span>}
      {sesion && (<>
        <span style={{ color:"#ccc" }}>|</span>
        <span>rol: <code>{sesion.rol}</code></span>
        <span style={{ color:"#ccc" }}>|</span>
        <span>nombre: <strong>{sesion.nombre}</strong></span>
      </>)}
    </div>
  );
}

function LogBox({ entry }: { entry: LogEntry | null }) {
  if (!entry) return null;
  return (
    <pre style={{ background:"#f0f0f0", borderRadius:6, padding:"8px 10px",
      fontSize:11, marginTop:8, maxHeight:160, overflow:"auto",
      whiteSpace:"pre-wrap", wordBreak:"break-all",
      borderLeft:`3px solid ${entry.ok ? "green" : "red"}` }}>
      <span style={{ color: entry.ok ? "green" : "red", fontWeight:600 }}>
        {entry.ok ? "OK" : "Error"}
      </span>{" "}· {entry.ts}{"\n"}
      {JSON.stringify(entry.data, null, 2)}
    </pre>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ border:"0.5px solid #ddd", borderRadius:10, padding:"14px 16px", marginBottom:14 }}>
      <p style={{ margin:"0 0 12px", fontWeight:500, fontSize:13, color:"#555" }}>{title}</p>
      {children}
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:8, marginBottom:8 }}>{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize:12, color:"#666", display:"block", marginBottom:4 }}>{label}</label>
      {children}
    </div>
  );
}

function Btn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ marginRight:8, marginTop:8 }}>{children}</button>
  );
}

// ─── secciones ────────────────────────────────────────────────────────────────

function SeccionRegistro({ onSesion }: { onSesion: (s: Sesion) => void }) {
  const [nombre, setNombre] = useState("");
  const [cedula, setCedula] = useState("");
  const [correo, setCorreo] = useState("");
  const [pass,   setPass  ] = useState("");
  const [turno,  setTurno ] = useState<"mañana"|"tarde"|"noche">("mañana");
  const { entry, ok, err } = usarLog();

  async function handleRegistro() {
    try {
      const s = await registrarVigilante({ nombre, cedula, correo, password: pass, turno });
      onSesion(s);
      ok(s);
    } catch (e) { err(e); }
  }

  return (
    <Card title="Registro de vigilante — POST /registro/vigilante">
      <Row>
        <Field label="Nombre"><input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Pedro Pérez" /></Field>
        <Field label="Cédula"><input value={cedula} onChange={e => setCedula(e.target.value)} placeholder="1234567890" /></Field>
      </Row>
      <Row>
        <Field label="Correo"><input type="email" value={correo} onChange={e => setCorreo(e.target.value)} placeholder="pedro@ucart.edu.co" /></Field>
        <Field label="Contraseña"><input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" /></Field>
      </Row>
      <Row>
        <Field label="Turno">
          <select value={turno} onChange={e => setTurno(e.target.value as typeof turno)}>
            <option value="mañana">Mañana</option>
            <option value="tarde">Tarde</option>
            <option value="noche">Noche</option>
          </select>
        </Field>
      </Row>
      <Btn onClick={handleRegistro}>Registrar</Btn>
      <LogBox entry={entry} />
    </Card>
  );
}

function SeccionLogin({ onSesion }: { onSesion: (s: Sesion) => void }) {
  const [correo, setCorreo] = useState("");
  const [pass,   setPass  ] = useState("");
  const { entry, ok, err } = usarLog();

  async function handleLogin() {
    try {
      const s = await login({ correo, password: pass });
      onSesion(s);
      ok(s);
    } catch (e) { err(e); }
  }

  return (
    <Card title="Login — POST /auth/login">
      <Row>
        <Field label="Correo"><input type="email" value={correo} onChange={e => setCorreo(e.target.value)} placeholder="correo@ucart.edu.co" /></Field>
        <Field label="Contraseña"><input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" /></Field>
      </Row>
      <Btn onClick={handleLogin}>Iniciar sesión</Btn>
      <LogBox entry={entry} />
    </Card>
  );
}

function SeccionSesion({ onLogout }: { onLogout: () => void }) {
  const { entry, ok, err } = usarLog();

  async function handleMe() {
    try { ok(await getMe()); } catch (e) { err(e); }
  }

  async function handleRefresh() {
    try { ok(await refreshSesion()); } catch (e) { err(e); }
  }

  async function handleLogout() {
    try {
      await logout();
      onLogout();
      ok("Sesión cerrada");
    } catch (e) {
      limpiarSesion();
      onLogout();
      err(e);
    }
  }

  return (
    <Card title="Sesión activa">
      <Btn onClick={handleMe}>GET /auth/me</Btn>
      <Btn onClick={handleRefresh}>Refresh token</Btn>
      <Btn onClick={handleLogout}>Logout</Btn>
      <LogBox entry={entry} />
    </Card>
  );
}

function SeccionRbac({ sesion }: { sesion: Sesion | null }) {
  const [recurso, setRecurso] = useState<Recurso>("dashboard_jefe");
  const { entry, ok, err } = usarLog();

  function handleCheck() {
    if (!sesion) { err("Sin sesión activa — inicia sesión primero"); return; }
    const puede = puedeAcceder(sesion.rol, recurso);
    ok({
      rol: sesion.rol,
      recurso,
      acceso: puede ? "PERMITIDO ✓" : "DENEGADO ✗",
      permisos_del_rol: PERMISOS[sesion.rol],
    });
  }

  return (
    <Card title="RBAC — verificar permiso">
      <Row>
        <Field label="Recurso">
          <select value={recurso} onChange={e => setRecurso(e.target.value as Recurso)}>
            <option value="dashboard_jefe">dashboard_jefe</option>
            <option value="gestionar_vigilantes">gestionar_vigilantes</option>
            <option value="ver_reportes">ver_reportes</option>
            <option value="registrar_ingreso">registrar_ingreso</option>
            <option value="ver_historial_propio">ver_historial_propio</option>
          </select>
        </Field>
      </Row>
      <Btn onClick={handleCheck}>Verificar acceso</Btn>
      <LogBox entry={entry} />
    </Card>
  );
}

// ─── page principal ───────────────────────────────────────────────────────────

export default function AuthTestPage() {
  const [sesion, setSesion] = useState<Sesion | null>(null);

  useEffect(() => {
    setSesion(cargarSesion());
  }, []);

  function handleSesion(s: Sesion) { setSesion(s); }
  function handleLogout()          { setSesion(null); }

  return (
    <main style={{ maxWidth:680, margin:"0 auto", padding:"24px 16px", fontFamily:"sans-serif" }}>
      <h1 style={{ fontSize:18, fontWeight:500, marginBottom:4 }}>UdSafe — banco de pruebas</h1>
      <p style={{ fontSize:13, color:"#888", marginBottom:20 }}>
        Maqueta para verificar funcionamiento de la API de autenticación.
      </p>

      <SesionBar sesion={sesion} />
      <SeccionRegistro onSesion={handleSesion} />
      <SeccionLogin    onSesion={handleSesion} />
      <SeccionSesion   onLogout={handleLogout} />
      <SeccionRbac     sesion={sesion} />
    </main>
  );
}