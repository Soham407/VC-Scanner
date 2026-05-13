import { useState } from 'react';
import { Mail, Send } from 'lucide-react';

import { useAuth } from '../lib/auth';
import { supabaseConfigError } from '../lib/supabase';

export function LoginPage() {
  const { signInWithEmail, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="login-page">
      <section className="login-panel">
        <div className="eyebrow">VS Scanner admin</div>
        <h1>Sign in with the same Supabase account as the mobile app.</h1>
        <p className="muted">
          Review personal leads, complete assigned team work, and manage team operations when your account has leader access.
        </p>
        {supabaseConfigError ? <p className="error-text">{supabaseConfigError}</p> : null}

        <button
          className="google-button"
          disabled={loading || Boolean(supabaseConfigError)}
          onClick={async () => {
            setLoading(true);
            setError(null);
            setMessage(null);
            try {
              await signInWithGoogle();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Google sign-in failed');
              setLoading(false);
            }
          }}
          type="button"
        >
          <span className="google-mark">G</span>
          Continue with Google
        </button>

        <div className="divider"><span>or</span></div>

        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            setLoading(true);
            setError(null);
            setMessage(null);
            try {
              await signInWithEmail(email);
              setMessage('Check your email for a sign-in link.');
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Sign-in failed');
            } finally {
              setLoading(false);
            }
          }}
        >
          <label className="field">
            <span>Email</span>
            <div className="input-wrap">
              <Mail size={16} />
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="leader@company.com" />
            </div>
          </label>
          <button className="primary-button" disabled={loading || Boolean(supabaseConfigError) || !email.trim()}>
            <Send size={16} />
            {loading ? 'Sending link...' : 'Send magic link'}
          </button>
          {message ? <p className="success-text">{message}</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
        </form>
      </section>
    </div>
  );
}
