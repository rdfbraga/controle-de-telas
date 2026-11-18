// Service worker mínimo: torna o app instalável. Dados são sempre buscados online (estado é do servidor).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
