import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { startApp } from './app'
import { store } from './store'
import { applyCssTokens } from './tokens'
import { App } from './ui/App'
import './ui/styles.css'

applyCssTokens()

const root = document.getElementById('app')!
const sceneEl = document.createElement('div')
sceneEl.className = 'scene'
const uiEl = document.createElement('div')
uiEl.className = 'ui'
root.append(sceneEl, uiEl)

createRoot(uiEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.DEV) Object.assign(window, { wasserlinie: { store } })

startApp(sceneEl).catch((err: unknown) => {
  console.error(err)
  store.getState().fail(err instanceof Error ? err.message : String(err))
})
