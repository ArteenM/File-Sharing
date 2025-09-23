import React, {useState} from 'react'

interface User
{
  id: string
  username: string
  accessToken: string
  refreshToken: string
}
interface formData
{
    username: string
    password: string
    confirmPassword?: string
}


interface FormErrors
{
    username?: string
    password?: string
    confirmPassword?: string
}

interface LoginPageProps
{
  onLoginSuccess: (userData: User) => void
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) =>
{
    const [formData, setFormData] = useState<formData>({
        username: '',
        password: ''
    })
    const [errors, setErrors] = useState<FormErrors>({})
    const [showPassword, setShowPassword] = useState(false)

    const validateForm = (): boolean => {
        const newErrors: FormErrors = {}

        if (!formData.username)
        {
            newErrors.username = 'Username is required'
        }

        if (!formData.password)
        {
            newErrors.password = 'Password is required'
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    const handleOnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const {name, value } = e.currentTarget
        setFormData(prev => ({
            ...prev,
            [name]: value
        }))

        if (errors[name as keyof FormErrors])
        {
            setErrors(prev => ({
                ...prev,
                [name]: undefined
        }))
    }
    }

    const handleSubmit = async() => {
        if (!validateForm()) return

        setErrors({})

        try
        {
          const BASE_URL = 'http://localhost:4000'
          
          const endpoint = `${BASE_URL}/login`


          const body = 
          {
            username: formData.username, password: formData.password 
          }
          const response = await fetch(endpoint,
          {
            method: 'POST',
            mode: 'cors',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            credentials: 'include',
          })
          if (!response.ok)
          {
            if(response.status === 400)
            {
              throw new Error('Invalid username or password');
            }
            else if (response.status === 500)
            {
                throw new Error('Server error. Please try again later.');
            }
            else
            {
                const errorText = await response.text();
                throw new Error(errorText || `Error: ${response.status}`);
            }
          }

          const data = await response.json()

          if (data.accessToken)
          {
            const userData: User = {
              id: data.user.id || data.user.username,
              username: data.user.username,
              accessToken: data.accessToken,
              refreshToken: data.refreshToken
            }
            onLoginSuccess(userData)
          }
        }
        catch(error)
        {
          console.error('Auth error:', error)
        }
      }

      return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Login Card */}
        <div className="bg-white border border-gray-300 p-6 space-y-4">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-xl font-semibold text-gray-900">Login</h1>
          </div>

          {/* Form */}
          <div className="space-y-3">
            {/* username Field */}
            <div>
              <label htmlFor="username" className="block text-sm text-gray-700 mb-1">
                username
              </label>
              <input
                id="username"
                name="username"
                type="username"
                value={formData.username}
                onChange={handleOnChange}
                className={`w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-gray-500 ${
                  errors.username ? 'border-red-400' : ''
                }`}
                placeholder="Enter username"
              />
              {errors.username && (
                <div className="mt-1 text-red-600 text-sm">
                  {errors.username}
                </div>
              )}
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={handleOnChange}
                className={`w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-gray-500 ${
                  errors.password ? 'border-red-400' : ''
                }`}
                placeholder="Enter password"
              />
              {errors.password && (
                <div className="mt-1 text-red-600 text-sm">
                  {errors.password}
                </div>
              )}
            </div>

            {/* Show Password */}
            <div className="flex items-center">
              <input
                type="checkbox"
                id="showPassword"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
                className="mr-2"
              />
              <label htmlFor="showPassword" className="text-sm text-gray-700">
                Show password
              </label>
            </div>

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              className="w-full bg-blue-600 text-white py-2 px-4 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            > Login
            </button>
            
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;