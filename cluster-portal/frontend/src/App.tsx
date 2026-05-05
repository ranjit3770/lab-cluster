import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import Layout from '@/components/Layout';
import UserLayout from '@/components/UserLayout';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import UserDashboardPage from '@/pages/UserDashboardPage';
import NodesPage from '@/pages/NodesPage';
import UsersPage from '@/pages/UsersPage';
import JobsPage from '@/pages/JobsPage';
import RequestsPage from '@/pages/RequestsPage';
import FilesPage from '@/pages/FilesPage';
import FeedbackPage from '@/pages/FeedbackPage';
import EditorPage from '@/pages/EditorPage';
import MaintenancePage from '@/pages/MaintenancePage';
import { Toaster } from 'sonner';
import { useState, useEffect } from 'react';
import api from '@/lib/api';

// Management Sub-pages
import PlatformConfigPage from '@/pages/management/PlatformConfigPage';
import JobSettingPage from '@/pages/management/JobSettingPage';
import AdminToolsPage from '@/pages/management/AdminToolsPage';
import DiagnosticConsolePage from '@/pages/management/DiagnosticConsolePage';

function MaintenanceBanner({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="bg-[#f97316] text-white px-6 py-1.5 flex items-center justify-center gap-4 text-[10px] font-black uppercase tracking-[0.2em] shadow-lg sticky top-0 z-[9999]">
        <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)] animate-pulse" />
            <span>Operational Mode: Lock</span>
        </div>
        <div className="hidden md:block w-px h-3 bg-white/20 mx-2" />
        <p className="opacity-95 text-center">SYSTEM IN MAINTENANCE MODE — CERTAIN FEATURES MAY BE RESTRICTED</p>
    </div>
  );
}

function AppContent() {
  const { user, token } = useAuth();
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [isWhitelisted, setIsWhitelisted] = useState(true);
  const isAdmin = user?.role === 'admin' || user?.role === 'developer';

  useEffect(() => {
    const checkMaintenance = async () => {
      if (window.location.pathname === '/maintenance') return;
      try {
        // Use a dedicated public endpoint for maintenance status to avoid 401 spam
        const res = await api.get('/api/v1/system-info/maintenance-status');
        setMaintenanceMode(res.data?.maintenance_active || false);
        setIsWhitelisted(true);
      } catch (err: any) {
        if (err.response?.status === 503 && err.response?.data?.maintenance) {
          setMaintenanceMode(true);
          setIsWhitelisted(false);
        }
      }
    };

    checkMaintenance();
    const interval = setInterval(checkMaintenance, 30000);
    return () => clearInterval(interval);
  }, [token, window.location.pathname]);

  // Authorization Redirect: 
  // 1. If Maintenance locked AND user is NOT whitelisted -> Force to Maintenance Page
  // 2. If Maintenance ON AND user IS whitelisted but NOT an Admin -> Allow Login but show banner
  if (maintenanceMode && !isWhitelisted && window.location.pathname !== '/maintenance') {
      return <MaintenancePage />;
  }

  // If Maintenance is active and user is logged in as a normal user (not admin), they should also see the lock page
  if (maintenanceMode && user && !isAdmin && window.location.pathname !== '/maintenance') {
       return <MaintenancePage />;
  }

  return (
    <div className="h-full flex flex-col">
      <MaintenanceBanner active={maintenanceMode} />
      <div className="flex-1 relative">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/maintenance" element={<MaintenancePage />} />
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              {isAdmin ? <Layout /> : <UserLayout />}
            </ProtectedRoute>
          }
        >
           {/* Default landing page depends on role */}
           <Route index element={isAdmin ? <Navigate to="/dashboard" replace /> : <UserDashboardPage />} />
           
           <Route path="dashboard" element={isAdmin ? <DashboardPage /> : <UserDashboardPage />} />
           <Route path="nodes" element={<NodesPage />} />
           <Route path="users" element={<UsersPage />} />
           <Route path="jobs" element={<JobsPage />} />
           <Route path="requests" element={<RequestsPage />} />
           <Route path="files" element={<FilesPage />} />
           <Route path="feedback" element={<FeedbackPage />} />
           <Route path="editor/:fileId" element={<EditorPage />} />
           
           {/* Management Hierarchy */}
           <Route path="management">
                <Route 
                    path="platform-config" 
                    element={<ProtectedRoute roles={['admin', 'developer']}><PlatformConfigPage /></ProtectedRoute>} 
                />
                <Route 
                    path="job-setting" 
                    element={<ProtectedRoute roles={['admin', 'developer']}><JobSettingPage /></ProtectedRoute>} 
                />
                <Route 
                    path="admin-tools" 
                    element={<ProtectedRoute roles={['admin', 'developer']}><AdminToolsPage /></ProtectedRoute>} 
                />
                <Route 
                    path="admin-tools/diagnostic-console" 
                    element={<ProtectedRoute roles={['admin', 'developer']}><DiagnosticConsolePage /></ProtectedRoute>} 
                />
           </Route>

           {/* Reverting settings route redirect to platform config */}
           <Route path="settings" element={<Navigate to="/management/platform-config" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      </div>
      <Toaster position="top-right" expand={false} richColors />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
          <AppContent />
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
