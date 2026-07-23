const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export function getDeviceId() {
  let id = localStorage.getItem("device-id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("device-id", id);
  }
  return id;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function getPushStatus() {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return "not-subscribed";
  const sub = await reg.pushManager.getSubscription();
  return sub ? "subscribed" : "not-subscribed";
}

export async function subscribeToPush() {
  if (!pushSupported()) throw new Error("Notificações push não são suportadas neste navegador.");
  if (!VAPID_PUBLIC_KEY) throw new Error("Chave VAPID não configurada.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Permissão de notificação não concedida.");

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await Promise.race([
      reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Tempo esgotado ao conectar com o serviço de notificações. Tente novamente.")), 15000)
      ),
    ]);
  }

  await fetch("/api/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: getDeviceId(), subscription: sub.toJSON() }),
  });

  return sub;
}

export async function syncSchedule(petNome, agendaItems, recorrentes) {
  try {
    await fetch("/api/sync-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: getDeviceId(), petNome, agendaItems, recorrentes }),
    });
  } catch (err) {
    // sincronização é best-effort — falha aqui não deve travar o uso do app
  }
}
