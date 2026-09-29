import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource-variable/inter'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'

import { App } from '@/App'
import { registerServiceWorker } from '@/features/notifications/pushApi'
import '@/index.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
    throw new Error('Elemento #root não encontrado')
}

createRoot(rootElement).render(
    <StrictMode>
        <App />
    </StrictMode>,
)

registerServiceWorker()
