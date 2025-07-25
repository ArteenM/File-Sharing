import { useState } from 'react';
import { login } from '../api/auth';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const { setToken } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = await login(email, password);
      setToken(data.token);
      navigate('/dashboard');
    } catch (e: any) {
      setMsg(e?.response?.data?.error || 'Login failed');
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: '4rem auto', fontFamily: 'sans-serif' }}>
      <h1>Login</h1>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 8 }}>
        <input type="email" placeholder="email" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" placeholder="password" value={password} onChange={e => setPassword(e.target.value)} required />
        <button type="submit">Log in</button>
      </form>
      {msg && <p>{msg}</p>}
      <p>No account? <Link to="/register">Register</Link></p>
    </div>
  );
}
