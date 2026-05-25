import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { getWebAuthRedirectUrl } from './authRedirect';
import { supabase, supabaseConfigError } from './supabase';

type AuthContextValue = {
  initialized: boolean;
  session: Session | null;
  user: User | null;
  signInWithEmail: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let active = true;

    if (supabaseConfigError) {
      setInitialized(true);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      setInitialized(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setInitialized(true);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      initialized,
      session,
      user: session?.user ?? null,
      signInWithEmail: async (email: string) => {
        if (supabaseConfigError) throw new Error(supabaseConfigError);

        const trimmed = email.trim();
        if (!trimmed) throw new Error('Email is required');

        const redirectTo = getWebAuthRedirectUrl();
        const { error } = await supabase.auth.signInWithOtp({
          email: trimmed,
          options: { emailRedirectTo: redirectTo }
        });
        if (error) throw new Error(error.message);
      },
      signInWithGoogle: async () => {
        if (supabaseConfigError) throw new Error(supabaseConfigError);

        const redirectTo = getWebAuthRedirectUrl();
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo
          }
        });
        if (error) throw new Error(error.message);
      },
      signOut: async () => {
        if (supabaseConfigError) return;

        const { error } = await supabase.auth.signOut();
        if (error) throw new Error(error.message);
      }
    }),
    [initialized, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return value;
}
