import { useAuth } from '../context/auth';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div style={{ maxWidth: 600, margin: '4rem auto', fontFamily: 'sans-serif' }}>
      <h1>Dashboard</h1>
      <p>Your token (shortened): {token ? token.slice(0, 20) + '...' : 'none'}</p>
      <button onClick={handleLogout}>Logout</button>
      <p>(Next: add file upload, list files, etc.)</p>
    </div>
  );
}
