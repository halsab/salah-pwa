globalThis.addEventListener('activate', (event) => {
  // Старый монолит не содержит пользовательских настроек или расписаний.
  event.waitUntil(globalThis.caches.delete('city-data'))
})
