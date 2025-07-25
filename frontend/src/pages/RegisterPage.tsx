import { useState } from 'react';
import { register } from '../api/auth';
import { Link, useNavigate } from 'react-router-dom';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await register(email, password);
      setMsg('Registered! Redirecting to login…');
      setTimeout(() => navigate('/login'), 800);
    } catch (e: any) {
      setMsg(e?.response?.data?.error || 'Registration failed');
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: '4rem auto', fontFamily: 'sans-serif' }}>
      <h1>Register</h1>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 8 }}>
        <input type="email" placeholder="email" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" placeholder="password" value={password} onChange={e => setPassword(e.target.value)} required />
        <button type="submit">Create account</button>
      </form>
      {msg && <p>{msg}</p>}
      <p>Already have an account? <Link to="/login">Log in</Link></p>
    </div>
  );
}
