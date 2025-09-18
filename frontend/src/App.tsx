import { useState } from 'react';
import LoginPage from './login.tsx'
import FileInputPage from './inputFile.tsx'
import RegisterPage from './register.tsx'

type PageType = 'login' | 'inputFile' | 'register'

interface User {
    id: string
    username: string
    accessToken: string
    refreshToken: string
}


function App()
{
    const [currentPage, setCurrentPage] = useState<PageType>('register')
    const [user, setUser] = useState<User | null>(null)

    const handleLoginSuccess = (userData: User) => {
        setUser(userData)
        setCurrentPage('inputFile')
    }

    const handleLogout = () =>
    {
        setUser(null)
        setCurrentPage('login')
    }

    const handleRegisterSuccess = () =>
    {
        setCurrentPage('login')
    }

    return (
        <div className="App">
            {currentPage === 'login' && (
                <LoginPage onLoginSuccess={handleLoginSuccess} />
            )}

            {currentPage === 'inputFile' && user && (
                <FileInputPage onLogout={handleLogout}/>
            )}

            {currentPage === 'register' && (
                <RegisterPage onRegisterSuccess={handleRegisterSuccess}/>
            )}
        </div>
    )
}

export default App