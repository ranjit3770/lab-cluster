import { useEffect, useState } from 'react';
import { dashboardApi } from '@/api/dashboard';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import PageLoader from '@/components/PageLoader';
import { ControllerFailureAlert } from '@/components/ControllerFailureAlert';
import { 
    Activity, Server, Cpu,
    Users, FileQuestion,
    CheckCircle2,
    MemoryStick as Memory,
    ChevronRight,
    Zap,
    Clock,
    Globe,
    AlertCircle,
    X,
    XCircle,
    BarChart3,
    Layers,
    Signal,
    History,
    ShieldCheck,
    Cpu as CpuIcon,
    HardDrive,
    Gauge
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface DashboardStats {
    cluster_status: {
        slurmctld_status: string;
        slurmdbd_status: string;
        cluster_status: string;
        last_heartbeat: string;
    };
    resources: {
        cpu_total: number;
        memory_total_mb: number;
        cpu_allocated: number;
        memory_allocated_mb: number;
        node_count: number;
        active_nodes: number;
        gpu_total: number;
        gpu_allocated: number;
    };
    utilization: {
        cpu_used_percent: number;
        memory_used_percent: number;
        gpu_used_percent: number;
    };
    jobs: {
        running: number;
        pending: number;
        completed: number;
        failed: number;
        cancelled: number;
        total: number;
        today_count: number;
    };
    users: { total_users: number };
    requests: { pending_requests: number };
    storage?: {
        total_gb: number;
        used_gb: number;
    };
}

export default function DashboardPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  const safePercent = (value: number, total: number) => {
    if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
    return Math.min(100, Math.max(0, (value / total) * 100));
  };

  useEffect(() => {
    let isMounted = true;
    const fetchStats = async () => {
        try {
            const response = await dashboardApi.getStats(token!);
            if (isMounted) {
                setStats(response.data);
                setError('');
                setLoading(false);
            }
        } catch (err: any) {
            if (isMounted) {
                setError(err.response?.data?.detail || err.message || 'Connection Error');
                setLoading(false);
            }
        }
    };
    if (token) {
        fetchStats();
        const tid = setInterval(fetchStats, 60000);
        return () => { isMounted = false; clearInterval(tid); };
    }
  }, [token, retryCount]);

  if (loading && !stats) return <PageLoader message="Loading dashboard..." />;

  if (error) return (
    <ControllerFailureAlert 
        error={error} 
        onRetry={() => {
            setLoading(true);
            setError('');
            setRetryCount(v => v + 1);
        }} 
    />
  );

  if (!stats) return null;

  return (
    <div className="flex flex-col gap-4 pb-4 selection:bg-primary/30 max-w-[1800px] mx-auto w-full animate-in fade-in duration-300">
        <header className="page-header flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
                <h1 className="page-title text-xl lg:text-2xl font-bold text-gray-900">Dashboard</h1>
                <p className="page-subtitle text-xs text-gray-500 flex items-center gap-2 mt-1">
                    <Globe className="h-3 w-3" />
                    Cluster Overview
                    <span className="h-1 w-1 rounded-full bg-gray-300" />
                    {new Date().toLocaleTimeString()}
                </p>
            </div>
            <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-emerald-50 border border-emerald-200">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-medium text-emerald-700 uppercase">{stats.cluster_status.cluster_status}</span>
            </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            <Card className="p-3 border-gray-200 bg-white hover:border-primary/30 hover:shadow-md transition-all cursor-pointer" onClick={() => navigate('/jobs')}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-md bg-primary/10">
                            <Zap className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <span className="text-[10px] font-medium text-gray-500 uppercase">CPU</span>
                    </div>
                    <span className="text-lg font-bold text-gray-900">{stats.resources.cpu_allocated}<span className="text-xs text-gray-400 font-normal">/{stats.resources.cpu_total}</span></span>
                </div>
                <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${safePercent(stats.resources.cpu_allocated, stats.resources.cpu_total)}%` }} />
                </div>
            </Card>

            <Card className="p-3 border-gray-200 bg-white hover:border-emerald-500/30 hover:shadow-md transition-all cursor-pointer" onClick={() => navigate('/jobs')}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-md bg-emerald-500/10">
                            <Memory className="h-3.5 w-3.5 text-emerald-500" />
                        </div>
                        <span className="text-[10px] font-medium text-gray-500 uppercase">Memory</span>
                    </div>
                    <span className="text-lg font-bold text-gray-900">{Math.round(stats.resources.memory_allocated_mb / 1024)}<span className="text-xs text-gray-400 font-normal">G/{Math.round(stats.resources.memory_total_mb / 1024)}G</span></span>
                </div>
                <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${safePercent(stats.resources.memory_allocated_mb, stats.resources.memory_total_mb)}%` }} />
                </div>
            </Card>

            <Card className="p-3 border-gray-200 bg-white hover:border-purple-500/30 hover:shadow-md transition-all cursor-pointer" onClick={() => navigate('/nodes')}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-md bg-purple-500/10">
                            <Server className="h-3.5 w-3.5 text-purple-500" />
                        </div>
                        <span className="text-[10px] font-medium text-gray-500 uppercase">Nodes</span>
                    </div>
                    <span className="text-lg font-bold text-gray-900">{stats.resources.active_nodes}<span className="text-xs text-gray-400 font-normal">/{stats.resources.node_count}</span></span>
                </div>
                <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${safePercent(stats.resources.active_nodes, stats.resources.node_count)}%` }} />
                </div>
            </Card>

            <Card className="p-3 border-gray-200 bg-white hover:border-amber-500/30 hover:shadow-md transition-all cursor-pointer" onClick={() => navigate('/requests')}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-md bg-amber-500/10">
                            <FileQuestion className="h-3.5 w-3.5 text-amber-500" />
                        </div>
                        <span className="text-[10px] font-medium text-gray-500 uppercase">Pending</span>
                    </div>
                    <span className="text-lg font-bold text-gray-900">{stats.requests.pending_requests}</span>
                </div>
                <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(stats.requests.pending_requests * 10, 100)}%` }} />
                </div>
            </Card>

            {stats.resources.gpu_total > 0 && (
                <Card className="p-3 border-gray-200 bg-white hover:border-rose-500/30 hover:shadow-md transition-all">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-md bg-rose-500/10">
                                <Gauge className="h-3.5 w-3.5 text-rose-500" />
                            </div>
                            <span className="text-[10px] font-medium text-gray-500 uppercase">GPU</span>
                        </div>
                        <span className="text-lg font-bold text-gray-900">{stats.resources.gpu_allocated || 0}<span className="text-xs text-gray-400 font-normal">/{stats.resources.gpu_total}</span></span>
                    </div>
                    <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-rose-500 rounded-full" style={{ width: `${safePercent(stats.resources.gpu_allocated || 0, stats.resources.gpu_total)}%` }} />
                    </div>
                </Card>
            )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
            <Card className="p-4 border-gray-200 bg-white hover:shadow-md transition-all cursor-pointer" onClick={() => navigate('/jobs')}>
                <CardHeader className="p-0 pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-medium text-gray-500 uppercase">Running</CardTitle>
                    <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                </CardHeader>
                <CardContent className="p-0 flex items-center justify-between">
                    <span className="text-3xl font-bold text-gray-900">{stats.jobs.running}</span>
                    <Activity className="h-5 w-5 text-primary opacity-50" />
                </CardContent>
            </Card>

            <Card className="p-4 border-gray-200 bg-white hover:shadow-md transition-all cursor-pointer" onClick={() => navigate('/jobs')}>
                <CardHeader className="p-0 pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-medium text-gray-500 uppercase">Pending</CardTitle>
                    <Clock className="h-4 w-4 text-amber-500 opacity-50" />
                </CardHeader>
                <CardContent className="p-0 flex items-center justify-between">
                    <span className="text-3xl font-bold text-gray-900">{stats.jobs.pending}</span>
                    <span className="text-[10px] text-gray-400">/ {stats.jobs.today_count} today</span>
                </CardContent>
            </Card>

            <Card className="p-4 border-gray-200 bg-emerald-50 hover:shadow-md transition-all cursor-pointer" onClick={() => navigate('/users')}>
                <CardHeader className="p-0 pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-medium text-gray-500 uppercase">Total Users</CardTitle>
                    <Users className="h-4 w-4 text-blue-500 opacity-50" />
                </CardHeader>
                <CardContent className="p-0 flex items-center justify-between">
                    <span className="text-3xl font-bold text-gray-900">{stats.users.total_users}</span>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                </CardContent>
            </Card>

            <Card className="p-4 border-gray-200 bg-emerald-50 hover:shadow-md transition-all">
                <CardHeader className="p-0 pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-medium text-emerald-600 uppercase">Completed</CardTitle>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent className="p-0">
                    <span className="text-3xl font-bold text-gray-900">{stats.jobs.completed}</span>
                </CardContent>
            </Card>

            <Card className="p-4 border-gray-200 bg-rose-50/50 hover:shadow-md transition-all">
                <CardHeader className="p-0 pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-medium text-rose-600 uppercase">Failed</CardTitle>
                    <XCircle className="h-4 w-4 text-rose-500" />
                </CardHeader>
                <CardContent className="p-0">
                    <span className="text-3xl font-bold text-gray-900">{stats.jobs.failed}</span>
                </CardContent>
            </Card>

            <Card className="p-4 border-gray-200 bg-white hover:shadow-md transition-all">
                <CardHeader className="p-0 pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-medium text-gray-500 uppercase">Cancelled</CardTitle>
                    <X className="h-4 w-4 text-gray-400" />
                </CardHeader>
                <CardContent className="p-0">
                    <span className="text-3xl font-bold text-gray-900">{stats.jobs.cancelled}</span>
                </CardContent>
            </Card>

            <Card className="p-4 border-gray-200 bg-white hover:shadow-md transition-all shadow-sm">
                <CardHeader className="p-0 pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-medium text-gray-500 uppercase">Total Jobs</CardTitle>
                    <History className="h-4 w-4 text-gray-400 opacity-50" />
                </CardHeader>
                <CardContent className="p-0">
                    <span className="text-3xl font-bold text-gray-900">{stats.jobs.total}</span>
                </CardContent>
            </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4 border-gray-200 bg-white hover:shadow-md transition-all cursor-pointer" onClick={() => navigate('/jobs')}>
                <CardHeader className="p-0 pb-2">
                    <CardTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <Layers className="h-4 w-4 text-primary" />
                        Jobs
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <p className="text-xs text-gray-500">View and manage all jobs</p>
                </CardContent>
            </Card>

            <Card className="p-4 border-gray-200 bg-white hover:shadow-md transition-all cursor-pointer" onClick={() => navigate('/nodes')}>
                <CardHeader className="p-0 pb-2">
                    <CardTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <Server className="h-4 w-4 text-purple-500" />
                        Nodes
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <p className="text-xs text-gray-500">View cluster nodes and status</p>
                </CardContent>
            </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <Card className="p-4 border-gray-200 bg-white">
                <CardHeader className="p-0 pb-3">
                    <CardTitle className="text-xs font-semibold text-gray-700 uppercase flex items-center gap-2">
                        <Activity className="h-4 w-4 text-primary" />
                        Cluster Services
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0 space-y-2">
                    <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
                        <span className="text-xs text-gray-600">Slurm Controller</span>
                        <Badge variant={stats.cluster_status.slurmctld_status === 'active' ? 'default' : 'destructive'} className={cn("text-[9px]", stats.cluster_status.slurmctld_status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>
                            {stats.cluster_status.slurmctld_status}
                        </Badge>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
                        <span className="text-xs text-gray-600">Slurm DBD</span>
                        <Badge variant={stats.cluster_status.slurmdbd_status === 'active' ? 'default' : 'destructive'} className={cn("text-[9px]", stats.cluster_status.slurmdbd_status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>
                            {stats.cluster_status.slurmdbd_status}
                        </Badge>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                        <span className="text-xs text-gray-600">Last Heartbeat</span>
                        <span className="text-[10px] text-gray-400 font-mono">{new Date(stats.cluster_status.last_heartbeat).toLocaleString()}</span>
                    </div>
                </CardContent>
            </Card>

            <Card className="p-4 border-gray-200 bg-white">
                <CardHeader className="p-0 pb-3">
                    <CardTitle className="text-xs font-semibold text-gray-700 uppercase flex items-center gap-2">
                        <Gauge className="h-4 w-4 text-primary" />
                        Utilization
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0 space-y-3">
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-600">CPU</span>
                            <span className="text-xs font-medium text-gray-900">{stats.utilization.cpu_used_percent}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${stats.utilization.cpu_used_percent}%` }} />
                        </div>
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-600">Memory</span>
                            <span className="text-xs font-medium text-gray-900">{stats.utilization.memory_used_percent}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${stats.utilization.memory_used_percent}%` }} />
                        </div>
                    </div>
                    {stats.resources.gpu_total > 0 && (
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-gray-600">GPU</span>
                                <span className="text-xs font-medium text-gray-900">{stats.utilization.gpu_used_percent}%</span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-rose-500 rounded-full" style={{ width: `${stats.utilization.gpu_used_percent}%` }} />
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    </div>
  );
}
