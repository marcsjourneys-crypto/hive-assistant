import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth-context';

export default function Login() {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        await register(email, password);
      } else {
        await login(email, password);
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      {/* Scanline overlay */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]"
           style={{
             backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)'
           }}
      />

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/">
            <img
              src="/hive.png"
              alt="Hive"
              className="w-48 h-48 mx-auto mb-4 drop-shadow-[0_0_30px_rgba(64,64,224,0.5)]"
            />
          </Link>
          <p className="text-gray-400 text-sm">Personal AI Assistant</p>
        </div>

        {/* Login Card with C64 glow effect */}
        <div className="bg-gray-900 rounded-xl p-8 border border-c64-blue/30 shadow-[0_0_40px_rgba(64,64,224,0.2)]">
          <h2 className="font-pixel text-lg text-white mb-6 text-center">
            {isRegister ? 'CREATE ACCOUNT' : 'SIGN IN'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-c64-blue focus:border-transparent outline-none"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-c64-blue focus:border-transparent outline-none"
                placeholder="Minimum 8 characters"
              />
            </div>

            {error && (
              <div className="text-red-400 text-sm bg-red-900/30 border border-red-800 p-3 rounded-lg">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 bg-hive-500 hover:bg-hive-600 text-black font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Please wait...' : isRegister ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-400">
            {isRegister ? (
              <>
                Already have an account?{' '}
                <button onClick={() => setIsRegister(false)} className="text-c64-cyan hover:underline">
                  Sign in
                </button>
              </>
            ) : (
              <>
                No account?{' '}
                <button onClick={() => setIsRegister(true)} className="text-c64-cyan hover:underline">
                  Create one
                </button>
              </>
            )}
          </div>
        </div>

        {/* Back to home link */}
        <div className="mt-6 text-center">
          <Link to="/" className="text-gray-500 hover:text-gray-300 text-sm">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
