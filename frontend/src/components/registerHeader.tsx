// ...existing code...
import React from 'react'

type PageType = 'login' | 'inputFile' | 'register'

interface RegisterHeaderProps {
  onPageChange: (page: PageType) => void
}

const RegisterHeader: React.FC<RegisterHeaderProps> = ({ onPageChange }) => {
  return (
    <header className="w-full overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100">
      <div className="max-w-6xl mx-auto px-6 py-4">
        <div className="flex items-center gap-6 bg-white/4 backdrop-blur-md border border-white/6 rounded-2xl p-4">
          <div className="text-lg font-extrabold">File‑Sharing</div>
          <nav className="ml-auto flex items-center gap-3">
            <button
              onClick={() => onPageChange('register')}
              className="text-sm text-slate-200 bg-white/6 hover:bg-white/10 px-3 py-2 rounded-md"
            >
              Register
            </button>
            <button
              onClick={() => onPageChange('login')}
              className="text-sm text-slate-200 bg-white/6 hover:bg-white/10 px-3 py-2 rounded-md"
            >
              Login
            </button>
          </nav>
        </div>
      </div>
    </header>
  )
}

export default RegisterHeader