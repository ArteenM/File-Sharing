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
            if (response.status === 409)
            {
              throw new Error('Username already exists');
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

        onRegisterSuccess()
        }
        catch(error)
        {
          console.error('Auth error:', error)
        }
      }

      return (
        <div>
            <h1>Register </h1>
            <label htmlFor="username"> Username </label>
            <input
            id="username"
            name = "username"
            value = {formData.username}
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

            <label htmlFor="password" > Password </label>
            <input
            id="password"
            name = "password"
            value = {formData.password}
            type={showPassword ? 'text' : 'password'}
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


            <label htmlFor="confirmPassword" > Confirm Password </label>
            <input
            name = "confirmPassword"
            id="confirmPassword"
            value= {formData.confirmPassword}
            type={showPassword ? 'text' : 'password'}
            onChange={handleOnChange}
             className={`w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-gray-500 ${
                  errors.password ? 'border-red-400' : ''
                }`}
                placeholder="Confirm Password"
              />
              {errors.confirmPassword && (
                <div className="mt-1 text-red-600 text-sm">
                  {errors.confirmPassword}
                </div>
              )}

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

        
      )
}

export default RegisterPage