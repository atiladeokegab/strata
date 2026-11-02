import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/public-sans/400.css'
import '@fontsource/public-sans/600.css'
import '@fontsource/geologica/600.css'
import './tokens.css'
import './index.css'
import App from './App.jsx'
import { useStore } from './store.js'
import * as tour from './tour/tour.js'

// ?capture=1: hand the store and the tour script to the frame-stepped film renderer (GPU capture of the shots).
if (new URLSearchParams(window.location.search).has('capture')) window.__strata = { useStore, tour }

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
