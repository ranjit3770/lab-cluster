import { createContext } from 'react';

export interface User {
  id: number;
  email: string;
  username: string;
  role: 'admin' | 'user' | 'developer';
  is_active: boolean;
}

export interface AuthContextType {
  token: string | null;
  user: User | null;
  login: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
  isLoading: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
