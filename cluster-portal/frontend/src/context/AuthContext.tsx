import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { jwtDecode } from 'jwt-decode';

interface User {
  email: string;
  username: string;
  role: 'admin' | 'user' | 'developer';
  is_active: boolean;
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  login: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [refreshToken, setRefreshToken] = useState<string | null>(localStorage.getItem('refreshToken'));
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
      try {
        const decoded: any = jwtDecode(token);
        setUser({ email: decoded.sub, role: decoded.role, is_active: true, username: decoded.username || decoded.sub }); 
      } catch (error) {
        logout();
      }
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      setUser(null);
    }
    setIsLoading(false);
  }, [token, refreshToken]);

  const login = (newToken: string, newRefreshToken: string) => {
    setToken(newToken);
    setRefreshToken(newRefreshToken);
  };

  const logout = () => {
    setToken(null);
    setRefreshToken(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
