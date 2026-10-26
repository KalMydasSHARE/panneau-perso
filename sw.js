/* Service worker de KalMydas perso : garde l'application sur l'appareil pour qu'elle s'ouvre sans réseau.
   Réseau d'abord (tu as toujours la dernière version), copie locale si le réseau manque. Les appels externes (Base, Open Food Facts) ne sont jamais gardés. */
const CACHE = 'kmp-v1';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.startsWith('/api/')) return; // relais Open Food Facts du serveur local : jamais gardé, toujours la réponse du moment
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); } return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});

/* Rappels des habitudes : boutons « Fait » et « Plus tard (10 min) » dans la notification du système (Chrome, Edge).
   Le coffre est chiffré et sa clé ne vit que dans la page : ce service worker ne lit et n'écrit aucune donnée. Il passe le geste à la page
   ouverte (même en arrière-plan) ; si aucune page n'est ouverte, il ouvre le panneau avec le geste dans l'adresse (identifiant de l'habitude,
   jamais son nom), et le geste s'applique au déverrouillage. Toucher la notification elle-même ramène sur le panneau. */
const ACTIONS = ['fait', 'plus-tard'];
async function rappelClic(action, data, clients) {
  const act = ACTIONS.includes(action) ? action : 'ouvrir', id = String((data && data.id) || ''), d = String((data && data.d) || '');
  if (!/^[a-z0-9]{1,40}$/i.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return 'ignoré';
  const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  const msg = { type: 'kmp-rappel', action: act, id, d };
  if (wins.length) {
    wins.forEach(w => w.postMessage(msg));
    if (act === 'ouvrir' && wins[0].focus) await wins[0].focus();
    return 'message';
  }
  if (clients.openWindow) await clients.openWindow(`./index.html#/rappel/${act}/${id}/${d}`);
  return 'ouvert';
}
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(rappelClic(e.action, e.notification.data, self.clients));
});
