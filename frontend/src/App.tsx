import { useState } from 'react';
import LoginPage from './pages/login.tsx'
import PeerApp from './pages/peerConnection.tsx'
import RegisterPage from './pages/register.tsx'
import Header from './components/headerComponent.tsx'
import RegisterHeader from './components/registerHeader.tsx';

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

    const handleLogout = async() =>
    {
        setUser(null)
        setCurrentPage('login')

        // Deletes token.

        const BASE_URL = 'http://localhost:4000'
          
        const endpoint = `${BASE_URL}/logout`


        const body = 
        {
            token: user?.accessToken
        }
          const response = await fetch(endpoint,
          {
            method: 'DELETE',
            mode: 'cors',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            credentials: 'include',
          })

          if (!response.ok)
          {
            if (response.status === 500)
            {
                throw new Error('Logout Failed!')
            }
            else
            {
                const errorText = await response.text();
                throw new Error(errorText || `Error: ${response.status}`);
            }
          }
    }

    const handleRegisterSuccess = () =>
    {
        setCurrentPage('login')
    }

    const handlePageChange = (page: PageType) => {
        setCurrentPage(page)
    }

    return (
        <div className="App">
            {currentPage === 'login' && (
                <>
                <RegisterHeader onPageChange={handlePageChange} />
                <LoginPage onLoginSuccess={handleLoginSuccess} />
                </>
            )}

            {currentPage === 'inputFile' && user && (
                <>
                <Header onLogout={handleLogout} />
                <PeerApp />
                </>
            )}

            {currentPage === 'register' && (
                <>
                <RegisterHeader onPageChange={handlePageChange} />
                <RegisterPage onRegisterSuccess={handleRegisterSuccess}/>
                </>
            )}
        </div>
    )
}

export default App