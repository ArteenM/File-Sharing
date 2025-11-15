import config from '../config'
import React, { useState } from 'react'

interface User {
  id: string
  username: string
  accessToken: string
  refreshToken: string
}

interface formData {
  username: string
  password: string
  confirmPassword?: string
}

interface FormErrors {
  username?: string
  password?: string
  confirmPassword?: string
  invalid?: string
}

interface LoginPageProps {
  onLoginSuccess: (userData: User) => void
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [formData, setFormData] = useState<formData>({
    username: '',
    password: ''
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

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleOnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.currentTarget
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))

    if (errors[name as keyof FormErrors]) {
      setErrors(prev => ({
        ...prev,
        [name]: undefined
      }))
    }
  }

  const handleSubmit = async () => {
    if (!validateForm()) return
    setErrors({})
    const newErrors: FormErrors = {}

    try {
      const BASE_URL = config.API_URL
      const endpoint = `${BASE_URL}/login`

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
        if (response.status === 400) {
          newErrors.invalid = 'Invalid username or password'
          setErrors(newErrors)
          throw new Error('Invalid username or password')
        } else if (response.status === 500) {
          throw new Error('Server error. Please try again later.')
        } else {
          const errorText = await response.text()
          throw new Error(errorText || `Error: ${response.status}`)
        }
      }

      const data = await response.json()

      if (data.accessToken) {
        const userData: User = {
          id: data.user.id || data.user.username,
          username: data.user.username,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken
        }
        onLoginSuccess(userData)
      }
    } catch (error) {
      console.error('Auth error:', error)
    }
  }

  return (
    <div className="min-h-screen min-w-screen overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 flex items-center justify-center pb-50">
      <div className="max-w-md w-full px-4">
        <div className="bg-white/4 backdrop-blur-md border border-white/6 rounded-2xl p-8 shadow-lg">
          <div className="mb-6 text-center">
            <h1 className="text-2xl md:text-3xl font-extrabold text-white">Login</h1>
            <p className="text-sm text-slate-300 mt-1">Demo Credentials:</p>
            <p className="text-sm text-slate-300 mt-1">Username: user</p>
            <p className="text-sm text-slate-300 mt-1">Password: user</p>
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
                placeholder="Enter username"
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
                placeholder="Enter password"
              />
              {errors.password && <div className="mt-1 text-rose-400 text-sm">{errors.password}</div>}
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
                Login
              </button>

              {errors.invalid && (
                <p className="text-rose-400 text-sm mt-3">{errors.invalid}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginPage