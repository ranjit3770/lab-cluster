import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { authApi } from '@/api/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('username', username.trim());
      formData.append('password', password);

      const response = await authApi.login(formData);
      const { access_token, refresh_token } = response.data;
      login(access_token, refresh_token);
      navigate(from, { replace: true });
    } catch (err: any) {
      console.error('Login error detail:', err.response?.data);
      if (err.response?.status === 400) {
          setError(err.response?.data?.detail || 'Invalid username or password');
      } else {
          setError('Server error. Please try again later.');
      }
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="https://my.amrita.edu/assets/newtheme/myamrita.png"
            alt="Logo"
            className="h-16 mx-auto mb-4"
          />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">HPC Portal</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to your account</p>
        </div>

        <Card className="shadow-sm">
          <CardContent className="p-6 pt-6">
            {error && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="username" className="text-xs font-medium text-foreground">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter username"
                  className="mt-1.5 h-9"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor="password" className="text-xs font-medium text-foreground">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter password"
                  className="mt-1.5 h-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>

            <div className="mt-4 border-t border-border pt-4 text-center">
              <p className="text-xs text-muted-foreground">
                Demo: admin / admin123
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
