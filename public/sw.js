// Service worker só para Web Push: não intercepta requisições nem guarda
// cache, então o carregamento do app continua o mesmo de sem ele.

const DEFAULT_TITLE = 'Organizer'
const APP_ICON = '/icon-192.png'
const APP_URL = '/'

self.addEventListener('install', () => {
    self.skipWaiting()
})

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim())
})

function readPayload(event) {
    if (!event.data) {
        return {}
    }
    try {
        const payload = event.data.json()
        return typeof payload === 'object' && payload !== null ? payload : {}
    } catch {
        return { body: event.data.text() }
    }
}

// Todo push vira notificação visível, mesmo com o app aberto: o iOS pode
// revogar a permissão de quem recebe push sem mostrar nada.
self.addEventListener('push', (event) => {
    const payload = readPayload(event)
    const title = typeof payload.title === 'string' && payload.title ? payload.title : DEFAULT_TITLE
    const options = {
        body: typeof payload.body === 'string' ? payload.body : '',
        icon: APP_ICON,
        badge: APP_ICON,
        data: { url: APP_URL },
    }
    if (typeof payload.tag === 'string' && payload.tag) {
        options.tag = payload.tag
    }

    event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
    event.notification.close()

    event.waitUntil(
        (async () => {
            const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            const openWindow = windows.find((client) => 'focus' in client)
            if (openWindow) {
                return openWindow.focus()
            }
            return self.clients.openWindow(APP_URL)
        })(),
    )
})
