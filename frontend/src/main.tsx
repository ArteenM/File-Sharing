import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './inputFile.tsx'
import LoginPage from './login.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LoginPage />
  </StrictMode>,
)
