import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Users,
  FileQuestion,
  Settings,
  LayoutDashboard,
  Server,
  Briefcase,
  Terminal,
  Network,
} from 'lucide-react';
import { useAuth } from '@/context/useAuth'
import { settingsApi } from '@/api/settings';
import { AppShell, type ShellNavGroup } from '@/components/shared/AppShell';
import type { BreadcrumbItem } from '@/components/shared/Breadcrumbs';

const MANAGEMENT_PATHS: Array<[string, string]> = [
  ['/node-management', 'Node Management'],
  ['/admin-tools', 'Compute Nodes'],
  ['/platform-config', 'Portal Settings'],
  ['/job-setting', 'System Status'],
  ['/cluster-management', 'Cluster Management'],
];

function resolveBreadcrumbs(clusterName: string) {
  return (pathname: string): BreadcrumbItem[] => {
    const crumbs: BreadcrumbItem[] = [{ label: clusterName }];

    if (pathname.includes('/management')) {
      crumbs.push({ label: 'Management' });
      const match = MANAGEMENT_PATHS.find(([fragment]) => pathname.includes(fragment));
      crumbs.push({ label: match ? match[1] : 'Management' });
      return crumbs;
    }

    const pageName = (() => {
      if (pathname.includes('/dashboard')) return 'Dashboard';
      if (pathname.startsWith('/nodes')) return 'Nodes';
      if (pathname.includes('/jobs')) return 'Jobs';
      if (pathname.includes('/users')) return 'Users';
      if (pathname.includes('/requests')) return 'Requests';
      if (pathname.includes('/files')) return 'Files';
      if (pathname.includes('/feedback')) return 'Feedback';
      if (pathname === '/') return 'Dashboard';
      return 'Dashboard';
    })();

    crumbs.push({ label: pageName });
    return crumbs;
  };
}

export default function Layout() {
  const { user, token, logout } = useAuth();
  const location = useLocation();
  const [clusterName, setClusterName] = useState('HPC Portal');
  const [clusterDesc, setClusterDesc] = useState('Cluster Management');
  const [pendingRequests, setPendingRequests] = useState(0);
  const [logoUrl] = useState<string | undefined>(
    'https://my.amrita.edu/assets/newtheme/myamrita.png'
  );

  useEffect(() => {
    const fetchBranding = async () => {
        try {
            const res = await settingsApi.getBranding();
            if (res.data?.cluster_name) setClusterName(res.data.cluster_name);
            if (res.data?.cluster_description) {
                setClusterDesc(res.data.cluster_description);
            }
        } catch {
            // Branding endpoint is best-effort; defaults already applied.
        }
    }

    const fetchPendingCount = async () => {
        try {
            const { dashboardApi } = await import('@/api/dashboard');
            const res = await dashboardApi.getStats(token!);
            if (res.data?.requests?.pending_requests !== undefined) {
                setPendingRequests(res.data.requests.pending_requests);
            }
        } catch {
            // Pending-request count is best-effort.
        }
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
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/nodes', icon: Server, label: 'Nodes' },
    { to: '/jobs', icon: Briefcase, label: 'Jobs' },
    { to: '/users', icon: Users, label: 'Users' },
    { to: '/requests', icon: FileQuestion, label: 'Requests', badge: pendingRequests },
  ];

  const managementItems: Array<{ to: string; icon: LucideIcon; label: string }> = [
    { to: '/management/platform-config', icon: Settings, label: 'Portal Settings' },
    { to: '/management/job-setting', icon: Briefcase, label: 'System Status' },
    { to: '/management/admin-tools', icon: Terminal, label: 'Compute Nodes' },
    { to: '/management/cluster-management', icon: Server, label: 'Cluster Management' },
    ...(user?.role === 'admin'
      ? [{ to: '/management/node-management', icon: Network, label: 'Node Management' }]
      : []),
  ];

  const isAdmin = user?.role === 'admin' || user?.role === 'developer';

  const navGroups: ShellNavGroup[] = [
    { label: 'General', items: mainNavItems },
    ...(isAdmin ? [{ label: 'Management', items: managementItems }] : []),
  ];

  if (isFocusMode) {
    return (
        <div className="h-screen overflow-hidden bg-background">
            <Outlet />
        </div>
    );
  }

  return (
    <AppShell
      navGroups={navGroups}
      logoUrl={logoUrl}
      title={clusterName}
      subtitle={clusterDesc}
      resolveBreadcrumbs={resolveBreadcrumbs(clusterName)}
      onLogout={() => logout()}
    />
  );
}
