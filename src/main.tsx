import '@fontsource/neucha/400.css'
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
