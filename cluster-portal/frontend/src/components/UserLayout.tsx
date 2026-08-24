import { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Files,
  Briefcase,
  FileQuestion,
  MessageSquare,
} from 'lucide-react';
import { useAuth } from '@/context/useAuth'
import { settingsApi } from '@/api/settings';
import { AppShell, type ShellNavGroup } from '@/components/shared/AppShell';
import type { BreadcrumbItem } from '@/components/shared/Breadcrumbs';

function resolveBreadcrumbs(clusterName: string) {
  return (pathname: string): BreadcrumbItem[] => {
    const crumbs: BreadcrumbItem[] = [{ label: clusterName }];

    const pageName = (() => {
      if (pathname === '/' || pathname.includes('/dashboard')) return 'Dashboard';
      if (pathname.includes('/files')) return 'Files';
      if (pathname.includes('/jobs')) return 'Jobs';
      if (pathname.includes('/requests')) return 'Requests';
      if (pathname.includes('/feedback')) return 'Feedback';
      return 'Dashboard';
    })();

    crumbs.push({ label: pageName });
    return crumbs;
  };
}

export default function UserLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [clusterName, setClusterName] = useState('STRACH');
  const [broadMessage, setBroadMessage] = useState('Research Portal');
  const [logoUrl] = useState<string | undefined>(
    'https://my.amrita.edu/assets/newtheme/myamrita.png'
  );

  useEffect(() => {
    const fetchBranding = async () => {
        try {
            const res = await settingsApi.getBranding();
            if (res.data?.cluster_name) setClusterName(res.data.cluster_name);
            if (res.data?.cluster_description) {
                setBroadMessage(res.data.cluster_description);
            }
        } catch {
            // Branding endpoint is best-effort; defaults already applied.
        }
    }

    fetchBranding();
    window.addEventListener('branding-update', fetchBranding);
    return () => window.removeEventListener('branding-update', fetchBranding);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // The editor is a full-height workspace and renders its own chrome.
  if (location.pathname.startsWith('/editor/')) {
    return (
      <div className="h-screen overflow-hidden bg-background">
        <Outlet />
      </div>
    );
  }

  const navItems: Array<{ to: string; icon: LucideIcon; label: string }> = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/files', icon: Files, label: 'Files' },
    { to: '/jobs', icon: Briefcase, label: 'Jobs' },
    { to: '/requests', icon: FileQuestion, label: 'Requests' },
    { to: '/feedback', icon: MessageSquare, label: 'Feedback' },
  ];

  const navGroups: ShellNavGroup[] = [{ label: 'Workspace', items: navItems }];

  return (
    <AppShell
      navGroups={navGroups}
      logoUrl={logoUrl}
      title={clusterName}
      subtitle={broadMessage}
      resolveBreadcrumbs={resolveBreadcrumbs(clusterName)}
      onLogout={handleLogout}
    />
  );
}
