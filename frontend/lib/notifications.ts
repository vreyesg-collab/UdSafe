/**
 * Reproduce un patrón de 3 pitidos de alarma usando Web Audio API.
 * No requiere ningún archivo de audio externo.
 */
export function tocarAlarma(): void {
  if (typeof window === "undefined") return;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    // Patrón: agudo → grave → agudo, separados 300 ms
    const beeps: [number, number][] = [[880, 0], [660, 0.3], [880, 0.6]];
    beeps.forEach(([freq, delay]) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "square";
      osc.frequency.value = freq;
      const t = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
      gain.gain.setValueAtTime(0.18, t + 0.2);
      gain.gain.linearRampToValueAtTime(0, t + 0.28);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  } catch {}
}

export async function pedirPermisoNotificaciones(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function mostrarNotificacion(
  titulo: string,
  opciones?: NotificationOptions
): Notification | null {
  if (typeof window === "undefined" || !("Notification" in window)) return null;
  if (Notification.permission !== "granted") return null;
  return new Notification(titulo, { icon: "/favicon.ico", ...opciones });
}
