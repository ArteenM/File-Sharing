import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
//import App from './App'
import PeerApp from './peerConnection'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PeerApp />
  </StrictMode>,
)
