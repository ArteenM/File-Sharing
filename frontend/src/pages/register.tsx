import React, {useState} from 'react'

interface FormData
{
    username: string
    password: string
    confirmPassword: string
}

interface FormErrors
{
    username?: string
    password?: string
    confirmPassword?: string
}

interface PostErrors
{
  username?: string
  server?: string
}

interface RegisterProps
{
    onRegisterSuccess: () => void
}

const RegisterPage: React.FC<RegisterProps> = ({ onRegisterSuccess }) =>
{
    const [formData, setFormData] = useState<FormData>({
        username: '',
        password: '',
        confirmPassword: ''
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
    
    if (!formData.confirmPassword)
    {
        newErrors.confirmPassword ='You must confirm your password'
    }

    else if (formData.password != formData.confirmPassword)
    {
        newErrors.confirmPassword ='Your passwords must match.'
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

    const handleSubmit = async() =>
    {
        if (!validateForm()) return

        setErrors({})

        try
        {
          const BASE_URL = 'http://localhost:4000'
          
          const endpoint = `${BASE_URL}/users`


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
            const postErrors: PostErrors = {}
            if (response.status === 409)
            {
              postErrors.username = 'Username already exists, please change it.'
              setErrors(postErrors)
              throw new Error(postErrors.username);
            }
            else if (response.status === 500)
            {
                postErrors.server = 'Server error. Please try again later'
                setErrors(postErrors)
                throw new Error(postErrors.server);
            }
            else
            {
                const errorText = await response.text();
                throw new Error(errorText || `Error: ${response.status}`);
            }
          }

        onRegisterSuccess()
        }
        catch(error)
        {
          console.error('Auth error:', error)
        }
      }

      return (
  <div className="min-h-214 min-w-screen bg-gray-100 flex items-center justify-center p-4">
    <div className="w-full max-w-sm">
      {/* Register Card */}
      <div className="bg-white border border-gray-300 p-6 space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-900">Register</h1>
        </div>

        {/* Form */}
        <div className="space-y-8">
          {/* Username Field */}
          <div>
            <label htmlFor="username" className="block text-sm text-gray-700 mb-1">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              value={formData.username}
              onChange={handleOnChange}
              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-gray-500 text-gray-900"

              placeholder="Enter username"
            />
            {errors.username && (
              <div className="mt-1 text-red-600 text-sm">{errors.username}</div>
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
              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-gray-500 text-gray-900"
              placeholder="Enter password"
            />
            {errors.password && (
              <div className="mt-1 text-red-600 text-sm">{errors.password}</div>
            )}
          </div>

          {/* Confirm Password Field */}
          <div>
            <label htmlFor="confirmPassword" className="block text-sm text-gray-700 mb-1">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              value={formData.confirmPassword}
              onChange={handleOnChange}
              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-gray-500 text-gray-900"
              placeholder="Confirm password"
            />
            {errors.confirmPassword && (
              <div className="mt-1 text-red-600 text-sm">{errors.confirmPassword}</div>
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
          >
            Register
          </button>
        </div>
      </div>
    </div>
  </div>
);

}

export default RegisterPage