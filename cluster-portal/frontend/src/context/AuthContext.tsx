import { useState, useEffect, type ReactNode } from 'react';
import { jwtDecode } from 'jwt-decode';
import { AuthContext, type User } from './auth-core';

interface DecodedToken {
  sub?: string;
  role?: User['role'];
  username?: string;
}

function decodeUser(token: string | null): User | null {
  if (!token) return null;
  try {
    const decoded = jwtDecode<DecodedToken>(token);
    return {
      email: decoded.sub ?? '',
      role: decoded.role ?? 'user',
      is_active: true,
      username: decoded.username || decoded.sub || '',
    };
  } catch {
    return null;
  }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [refreshToken, setRefreshToken] = useState<string | null>(localStorage.getItem('refreshToken'));
  const [user, setUser] = useState<User | null>(() => decodeUser(token));
  // Auth state resolves synchronously (localStorage is read in the useState
  // initializer), so there is no asynchronous loading phase.
  const isLoading = false;

  const login = (newToken: string, newRefreshToken: string) => {
    setToken(newToken);
    setRefreshToken(newRefreshToken);
  };

  const logout = () => {
    setToken(null);
    setRefreshToken(null);
  };

  // Re-derive user state when the token changes (during-render adjustment).
  const [prevToken, setPrevToken] = useState(token);
  if (prevToken !== token) {
    setPrevToken(token);
    const nextUser = decodeUser(token);
    if (token && !nextUser) {
      // Token is present but invalid/expired: clear it (previous behaviour
      // called logout() from the effect).
      logout();
    } else {
      setUser(nextUser);
    }
  }

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
    }
  }, [token, refreshToken]);

  return (
    <AuthContext.Provider value={{ token, user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};
