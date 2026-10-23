const SAFE_PATHS = new Set(["/planner", "/dashboard"]);

function safeNotificationData(value) {
  const fallback = { title: "Lembrete da Agenda", body: "Você tem um compromisso no SUPERPONTOS.", url: "/planner", tag: "planner-reminder" };
  if (!value || typeof value !== "object") return fallback;
  let url = fallback.url;
  if (typeof value.url === "string") {
    try { const parsed = new URL(value.url, self.location.origin); if (parsed.origin === self.location.origin && SAFE_PATHS.has(parsed.pathname)) url = `${parsed.pathname}${parsed.search}`; } catch {}
  }
  return {
    title: typeof value.title === "string" && value.title.length <= 120 ? value.title : fallback.title,
    body: typeof value.body === "string" && value.body.length <= 240 ? value.body : fallback.body,
    url,
    tag: typeof value.tag === "string" && /^[A-Za-z0-9:_-]{1,160}$/.test(value.tag) ? value.tag : fallback.tag,
  };
}

self.addEventListener("push", (event) => {
  let payload = null;
  try { payload = event.data ? event.data.json() : null; } catch {}
  const data = safeNotificationData(payload);
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, tag: data.tag, data: { url: data.url }, icon: undefined, badge: undefined }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = safeNotificationData({ url: event.notification.data?.url });
  const target = new URL(data.url, self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) { await client.navigate(target); return client.focus(); }
    }
    return clients.openWindow(target);
  }));
});
