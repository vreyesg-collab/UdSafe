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
