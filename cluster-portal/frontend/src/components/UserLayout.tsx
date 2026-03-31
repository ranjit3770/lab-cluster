import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { settingsApi } from '@/api/settings';
import { 
  LayoutDashboard, 
  Files, 
  Briefcase, 
  FileQuestion, 
  MessageSquare,
  LogOut,
  Cpu,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const UserNavLink = ({ to, icon: Icon, label }: { to: string, icon: any, label: string }) => {
    return (
        <NavLink
            to={to}
            className={({ isActive }) =>
                cn(
                    "flex items-center gap-2 px-3 py-2 text-sm font-medium transition-all duration-150 rounded-lg group",
                    isActive 
                        ? "bg-white text-black font-bold border-2 border-black shadow-sm" 
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )
            }
        >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
        </NavLink>
    );
};

export default function UserLayout() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [clusterName, setClusterName] = useState("STRACH");
  const [broadMessage, setBroadMessage] = useState("Research Portal");
  const [logoUrl, setLogoUrl] = useState("https://my.amrita.edu/assets/newtheme/myamrita.png");

  useEffect(() => {
    const fetchBranding = async () => {
        try {
            const res = await settingsApi.getBranding();
            if (res.data?.cluster_name) setClusterName(res.data.cluster_name);
            if (res.data?.cluster_description) {
                setBroadMessage(res.data.cluster_description);
            }
        } catch(e) {}
    }

    fetchBranding();
    window.addEventListener('branding-update', fetchBranding);
    return () => window.removeEventListener('branding-update', fetchBranding);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="h-screen bg-background flex flex-col font-sans overflow-hidden text-foreground">
        <header className="shrink-0 min-h-[3.5rem] h-auto w-full px-5 bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
            <div className="max-w-[1800px] mx-auto h-full flex items-center justify-between">
                <div className="flex items-center gap-3 cursor-pointer group" onClick={() => navigate('/')}>
                    <img 
                        src={logoUrl} 
                        alt="Logo" 
                        className="h-8 w-auto transition-all group-hover:scale-105 group-hover:rotate-[-4deg]"
                    />
                    <div className="hidden sm:flex flex-col border-l border-gray-100 pl-3 ml-1">
                        <div className="flex items-center gap-1.5">
                            <h2 className="text-base font-bold tracking-tight text-gray-900 leading-tight">{clusterName}</h2>
                            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(20,184,166,0.6)]" />
                        </div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mt-0.5">{broadMessage}</p>
                    </div>
                </div>

                <nav className="hidden lg:flex items-center gap-1 ml-6">
                    <UserNavLink to="/" icon={LayoutDashboard} label="Dashboard" />
                    <UserNavLink to="/files" icon={Files} label="Files" />
                    <UserNavLink to="/jobs" icon={Briefcase} label="Jobs" />
                    <UserNavLink to="/requests" icon={FileQuestion} label="Requests" />
                    <UserNavLink to="/feedback" icon={MessageSquare} label="Feedback" />
                </nav>

                <div className="flex items-center gap-3">
                    <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
                        <Avatar className="h-6 w-6">
                            <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">
                                {user?.username?.substring(0,2).toUpperCase() || "US"}
                            </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium text-gray-900">{user?.username}</span>
                    </div>
                    
                    <Badge variant="secondary" className="hidden lg:flex text-[10px] font-medium px-1.5 py-0 h-5 bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                        Active
                    </Badge>

                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={handleLogout}
                        className="text-gray-500 hover:text-gray-900 gap-2"
                    >
                        <LogOut className="h-4 w-4" />
                        <span className="hidden sm:inline text-xs font-medium">Logout</span>
                    </Button>
                </div>
            </div>

            <nav className="lg:hidden flex items-center gap-1 mt-3 pt-3 border-t border-gray-100 overflow-x-auto no-scrollbar pb-2">
                <UserNavLink to="/" icon={LayoutDashboard} label="Dashboard" />
                <UserNavLink to="/files" icon={Files} label="Files" />
                <UserNavLink to="/jobs" icon={Briefcase} label="Jobs" />
                <UserNavLink to="/requests" icon={FileQuestion} label="Requests" />
            </nav>
        </header>

        <main className="flex-1 px-4 py-4 overflow-auto custom-scrollbar">
            <div className="max-w-[1800px] mx-auto animate-in fade-in duration-300">
               <Outlet />
            </div>
        </main>
    </div>
  );
}
