import '@fontsource/alegreya-sans/cyrillic-400.css'
import '@fontsource/alegreya-sans/cyrillic-500.css'
import '@fontsource/alegreya-sans/cyrillic-700.css'
import '@fontsource/alegreya-sans/latin-400.css'
import '@fontsource/alegreya-sans/latin-500.css'
import '@fontsource/alegreya-sans/latin-700.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'

import { App } from './App'
import { createServiceWorkerReloadGuard } from './platform/serviceWorkerUpdate'
import './styles.css'

registerSW({
  immediate: true,
  onNeedReload: createServiceWorkerReloadGuard(),
})

const root = document.getElementById('root')
if (!root) throw new Error('Не найден корневой элемент приложения')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
