import '@fontsource/neucha/400.css'
import '@fontsource-variable/nunito'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'

import { App } from './App'
import './styles.css'

registerSW({ immediate: true })

const root = document.getElementById('root')
if (!root) throw new Error('Не найден корневой элемент приложения')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
