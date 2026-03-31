import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { settingsApi } from '@/api/settings';
import { 
  Users, 
  FileQuestion, 
  Settings,
  LogOut,
  Menu,
  LayoutDashboard,
  Server,
  Briefcase,
  Terminal,
  ChevronDown,
  Zap,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

const NavItem = ({ to, icon: Icon, label, onClick }: { to: string, icon: any, label: string, onClick?: () => void }) => {
    return (
        <NavLink
            to={to}
            onClick={onClick}
            className={({ isActive }) =>
                cn(
                    "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-150",
                    isActive 
                        ? "bg-white text-black shadow-md font-bold border-2 border-black" 
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 border-2 border-transparent"
                )
            }
        >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
        </NavLink>
    );
};

export default function Layout() {
  const { user, token, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [managementExpanded, setManagementExpanded] = useState(true);
  const [clusterName, setClusterName] = useState("HPC Portal");
  const [clusterDesc, setClusterDesc] = useState("Cluster Management");
  const [pendingRequests, setPendingRequests] = useState(0);

  useEffect(() => {
    const fetchBranding = async () => {
        try {
            const res = await settingsApi.getBranding();
            if (res.data?.cluster_name) setClusterName(res.data.cluster_name);
            if (res.data?.cluster_description) {
                setClusterDesc(res.data.cluster_description);
            }
        } catch(e) {}
    }

    const fetchPendingCount = async () => {
        try {
            const { dashboardApi } = await import('@/api/dashboard');
            const res = await dashboardApi.getStats(token!);
            if (res.data?.requests?.pending_requests !== undefined) {
                setPendingRequests(res.data.requests.pending_requests);
            }
        } catch(e) {}
    }

    if (token) {
        fetchBranding();
        fetchPendingCount();
        
        window.addEventListener('branding-update', fetchBranding);
        
        const tid = setInterval(fetchPendingCount, 30000);
        return () => {
            window.removeEventListener('branding-update', fetchBranding);
            clearInterval(tid);
        };
    }
  }, [token]);

  const isDiagnosticConsole = location.pathname.includes('/diagnostic-console');
  const isFocusMode = isDiagnosticConsole;

  const mainNavItems = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/nodes", icon: Server, label: "Nodes" },
    { to: "/jobs", icon: Briefcase, label: "Jobs" },
    { to: "/users", icon: Users, label: "Users" },
    { to: "/requests", icon: FileQuestion, label: "Requests" },
  ];

  const managementItems = [
    { to: "/management/platform-config", icon: Settings, label: "Portal Settings" },
    { to: "/management/job-setting", icon: Briefcase, label: "System Status" },
    { to: "/management/admin-tools", icon: Terminal, label: "Node Tools" },
  ];

  const isAdmin = user?.role === 'admin' || user?.role === 'developer';

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'developer': return 'bg-purple-100 text-purple-700 border-purple-200';
      default: return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  const getCurrentPageName = () => {
    const path = location.pathname;
    if (path.includes('/dashboard')) return 'Dashboard';
    if (path.includes('/nodes')) return 'Nodes';
    if (path.includes('/jobs')) return 'Jobs';
    if (path.includes('/users')) return 'Users';
    if (path.includes('/requests')) return 'Requests';
    if (path.includes('/files')) return 'Files';
    if (path.includes('/feedback')) return 'Feedback';
    if (path.includes('/admin-tools')) return 'Node Tools';
    if (path.includes('/platform-config')) return 'Portal Settings';
    if (path.includes('/job-setting')) return 'System Status';
    return 'Dashboard';
  };

  const SidebarContent = ({ closeSheet }: { closeSheet?: () => void }) => (
    <div className="flex flex-col h-full bg-white relative">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
            <div className="cursor-pointer group" onClick={() => navigate('/')}>
                <div className="flex items-center gap-2 mb-2">
                    <img 
                        src="https://my.amrita.edu/assets/newtheme/myamrita.png" 
                        alt="Amrita HPC Logo" 
                        className="h-8 w-auto"
                    />
                </div>
                <h2 className="text-base font-bold text-gray-900">{clusterName}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{clusterDesc}</p>
            </div>
            {closeSheet && (
                <Button variant="ghost" size="icon" className="lg:hidden" onClick={closeSheet}>
                    <X className="h-4 w-4" />
                </Button>
            )}
        </div>
      </div>
      
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {!isFocusMode && (
            <div className="space-y-1">
                 {mainNavItems.map((item) => (
                    <NavItem 
                        key={item.to} 
                        {...item} 
                        onClick={() => closeSheet?.()} 
                    />
                 ))}
            </div>
        )}

        {isAdmin && (
            <div className="space-y-1 mt-4 pt-4 border-t border-gray-100">
                 <button 
                    onClick={() => setManagementExpanded(!managementExpanded)}
                    className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                    <span className="flex items-center gap-2">
                        <Zap className="h-3 w-3" />
                        Management
                    </span>
                    {managementExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronDown className="h-3 w-3 rotate-[-90deg]" />}
                </button>
                
                {managementExpanded && (
                    <div className="space-y-1 mt-1">
                        {managementItems.map((item) => (
                            <NavItem 
                                key={item.to} 
                                {...item} 
                                onClick={() => closeSheet?.()} 
                            />
                        ))}
                    </div>
                )}
            </div>
        )}
      </nav>

      <div className="p-3 border-t border-gray-200">
        <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 border border-gray-100">
            <Avatar className="h-9 w-9 border border-gray-200">
                <AvatarFallback className={cn(
                    "text-xs font-bold",
                    user?.role === 'admin' ? "bg-amber-100 text-amber-700" :
                    user?.role === 'developer' ? "bg-purple-100 text-purple-700" :
                    "bg-blue-100 text-blue-700"
                )}>
                    {user?.username?.substring(0,2).toUpperCase() || "US"}
                </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user?.username || 'Guest'}</p>
                <Badge variant="secondary" className={cn("text-[10px] font-medium px-1.5 py-0 h-5", getRoleBadgeColor(user?.role || 'user'))}>
                    {user?.role || 'user'}
                </Badge>
            </div>
            <Button variant="ghost" size="icon" onClick={logout} className="text-gray-500 hover:text-gray-900">
                <LogOut className="h-4 w-4" />
            </Button>
        </div>
      </div>
    </div>
  );

  if (isFocusMode) {
    return (
        <div className="h-screen bg-gray-50 overflow-hidden">
            <Outlet />
        </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans text-gray-900">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex flex-col w-60 fixed inset-y-0 z-50 border-r border-gray-200 bg-white">
           <SidebarContent />
        </aside>

        {/* Mobile Header with Tabs */}
        <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm">
            <div className="flex items-center justify-between h-14 px-3">
                <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
                    <SheetTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-gray-600">
                            <Menu className="h-5 w-5" />
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="p-0 w-72 border-r border-gray-200 bg-white">
                        <SidebarContent closeSheet={() => setIsMobileOpen(false)} />
                    </SheetContent>
                </Sheet>
                <div className="flex items-center gap-2">
                    <img src="https://my.amrita.edu/assets/newtheme/myamrita.png" alt="Logo" className="h-6 w-auto" />
                    <span className="text-sm font-semibold text-gray-900">{clusterName}</span>
                </div>
                <Badge variant="secondary" className={cn("text-xs font-medium", getRoleBadgeColor(user?.role || 'user'))}>
                    {user?.role}
                </Badge>
            </div>
            
            {/* Mobile Tab Navigation - Improved visibility */}
            <div className="flex items-center gap-1 px-2 pb-2 overflow-x-auto">
                {mainNavItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                            cn(
                                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-all",
                                isActive 
                                    ? "bg-primary text-white shadow-lg shadow-primary/30 font-semibold" 
                                    : "text-gray-600 hover:bg-gray-100"
                            )
                        }
                    >
                        <item.icon className="h-3.5 w-3.5" />
                        <span>{item.label}</span>
                    </NavLink>
                ))}
                {isAdmin && managementItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                            cn(
                                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-all",
                                isActive 
                                    ? "bg-white text-black shadow-sm font-bold border-2 border-black" 
                                    : "text-gray-600 hover:bg-gray-100"
                            )
                        }
                    >
                        <item.icon className="h-3.5 w-3.5" />
                        <span>{item.label}</span>
                    </NavLink>
                ))}
            </div>
        </div>

      <main className="flex-1 flex flex-col h-screen relative overflow-hidden lg:ml-60 pt-28 lg:pt-0">
        {/* Desktop Header - Improved styling */}
        <header className="hidden lg:flex h-14 shrink-0 items-center justify-between px-5 bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
          <div className="flex items-center gap-2.5 text-sm">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em]">{clusterName}</span>
              <span className="text-gray-300">/</span>
              <span className="font-semibold text-gray-900">{getCurrentPageName()}</span>
          </div>
          <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                  <Avatar className="h-6 w-6">
                      <AvatarFallback className={cn("text-[10px] font-bold", user?.role === 'admin' ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700")}>
                          {user?.username?.substring(0,2).toUpperCase() || "US"}
                      </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium text-gray-700">{user?.username}</span>
              </div>
              <Badge variant="secondary" className={cn("text-xs font-medium", getRoleBadgeColor(user?.role || 'user'))}>
                {user?.role}
              </Badge>
              <Button variant="ghost" size="sm" onClick={logout} className="text-gray-500 hover:text-gray-900">
                  <LogOut className="h-4 w-4 mr-1" />
                  Logout
              </Button>
          </div>
        </header>

        <div className="flex-1 overflow-auto bg-gray-50 p-4">
             <div className="max-w-[1800px] mx-auto">
                 <Outlet />
             </div>
        </div>
      </main>
    </div>
  );
}
