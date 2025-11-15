// ...existing code...
import React, { useState } from 'react'

interface FormData {
  username: string
  password: string
  confirmPassword: string
}

interface FormErrors {
  username?: string
  password?: string
  confirmPassword?: string
}

interface PostErrors {
  username?: string
  server?: string
}

interface RegisterProps {
  onRegisterSuccess: () => void
}

const RegisterPage: React.FC<RegisterProps> = ({ onRegisterSuccess }) => {
  const [formData, setFormData] = useState<FormData>({
    username: '',
    password: '',
    confirmPassword: ''
  })

  const [errors, setErrors] = useState<FormErrors>({})
  const [showPassword, setShowPassword] = useState(false)

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    if (!formData.username) {
      newErrors.username = 'Username is required'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'You must confirm your password'
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Your passwords must match.'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleOnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.currentTarget
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))

    if ((errors as any)[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: undefined
      }))
    }
  }

  const handleSubmit = async () => {
    if (!validateForm()) return

    setErrors({})

    try {
      const BASE_URL = 'http://localhost:4000'
      const endpoint = `${BASE_URL}/users`

      const body = {
        username: formData.username, password: formData.password
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        credentials: 'include'
      })

      if (!response.ok) {
        const postErrors: PostErrors = {}
        if (response.status === 409) {
          postErrors.username = 'Username already exists, please change it.'
          setErrors(postErrors)
          throw new Error(postErrors.username)
        } else if (response.status === 500) {
          postErrors.server = 'Server error. Please try again later'
          setErrors(postErrors)
          throw new Error(postErrors.server)
        } else {
          const errorText = await response.text()
          throw new Error(errorText || `Error: ${response.status}`)
        }
      }

      onRegisterSuccess()
    } catch (error) {
      console.error('Auth error:', error)
    }
  }

  return (
    <div className="min-h-screen w-screen overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 flex items-center justify-center pb-35">
      <div className="max-w-md w-full px-6">
        <div className="bg-white/4 backdrop-blur-md border border-white/6 rounded-2xl p-8 shadow-lg">
          <div className="mb-6 text-center">
            <h1 className="text-2xl md:text-3xl font-extrabold text-white">Register</h1>
            <p className="text-sm text-slate-300 mt-1">Register to start secure, peer-to-peer file transfers.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-slate-300">Username</label>
              <input
                id="username"
                name="username"
                type="text"
                value={formData.username}
                onChange={handleOnChange}
                className="mt-2 w-full rounded-md px-3 py-2 bg-transparent border border-white/6 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="Choose a username"
              />
              {errors.username && <div className="mt-1 text-rose-400 text-sm">{errors.username}</div>}
            </div>

            <div>
              <label className="text-sm text-slate-300">Password</label>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={handleOnChange}
                className="mt-2 w-full rounded-md px-3 py-2 bg-transparent border border-white/6 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="Create a password"
              />
              {errors.password && <div className="mt-1 text-rose-400 text-sm">{errors.password}</div>}
            </div>

            <div>
              <label className="text-sm text-slate-300">Confirm password</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={handleOnChange}
                className="mt-2 w-full rounded-md px-3 py-2 bg-transparent border border-white/6 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="Confirm password"
              />
              {errors.confirmPassword && <div className="mt-1 text-rose-400 text-sm">{errors.confirmPassword}</div>}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="showPassword"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
                className="h-4 w-4 rounded bg-white/6"
              />
              <label htmlFor="showPassword" className="text-sm text-slate-300">Show password</label>
            </div>

            <div>
              <button
                onClick={handleSubmit}
                className="w-full text-white py-3 px-4 rounded-full font-semibold hover:opacity-95"
              >
                Register
              </button>
              {(errors as any).username && <p className="text-rose-400 text-sm mt-3">{(errors as any).username}</p>}
              {(errors as any).server && <p className="text-rose-400 text-sm mt-3">{(errors as any).server}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default RegisterPage