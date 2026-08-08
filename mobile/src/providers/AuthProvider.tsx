import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { signIn, signOut, signUp } from '../services/auth';
import { supabase } from '../services/supabase';

type AuthSession = Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'];

interface AuthContextValue {
  session: AuthSession | null;
  user: NonNullable<AuthSession>['user'] | null;
  loading: boolean;
  signIn: typeof signIn;
  signUp: typeof signUp;
  signOut: typeof signOut;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthContextValue['session']>(null);
  const [user, setUser] = useState<AuthContextValue['user']>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function initializeAuth() {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) {
        return;
      }

      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    }

    initializeAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!isMounted) {
        return;
      }

      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      loading,
      signIn,
      signUp,
      signOut,
    }),
    [session, user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
