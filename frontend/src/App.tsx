import React, { useState } from 'react';
import AuthPage from './pages/tempMain';
import FileUploadPage from './pages/fileUpload';
import './App.css';

// Define the possible pages in your app
type PageType = 'auth' | 'fileUpload';

// Define what user data we store after login
interface User {
  id: string;
  username: string;
  accessToken: string;
  refreshToken: string;
}

function App() {
  // Track which page we're currently showing
  const [currentPage, setCurrentPage] = useState<PageType>('auth');
  
  // Store user data after successful login
  const [user, setUser] = useState<User | null>(null);

  // Handle successful login - called from AuthPage
  const handleLoginSuccess = (userData: User) => {
    setUser(userData);
    setCurrentPage('fileUpload');
  };

  // Handle logout - return to login page
  const handleLogout = () => {
    setUser(null);
    setCurrentPage('auth');
  };

  // Render the appropriate page based on current state
  return (
    <div className="App">
      {currentPage === 'auth' && (
        <AuthPage onLoginSuccess={handleLoginSuccess} />
      )}
      
      {currentPage === 'fileUpload' && user && (
        <FileUploadPage 
          user={user} 
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}

export default App;