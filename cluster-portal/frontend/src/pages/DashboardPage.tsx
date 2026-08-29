import { useEffect, useState } from 'react';
import { dashboardApi } from '@/api/dashboard';
import { useAuth } from '@/context/useAuth'
import { useNavigate } from 'react-router-dom';
import PageLoader from '@/components/PageLoader';
import { ControllerFailureAlert } from '@/components/ControllerFailureAlert';
import {
    Activity, Server, Users, FileQuestion,
    CheckCircle2,
    MemoryStick as Memory,
    ChevronRight,
    Clock,
    Globe,
    X,
    XCircle,
    Layers,
    History,
    Zap,
    Gauge,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { MetricCard } from "@/components/shared/MetricCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { apiErrorMessage } from "@/api/errors";

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
        } catch (err) {
            if (isMounted) {
                setError(apiErrorMessage(err, 'Connection Error'));
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
    <div className="flex w-full flex-col gap-5 pb-4">
        <PageHeader
            title="Dashboard"
            description={
                <span className="flex items-center gap-2">
                    <Globe className="h-3 w-3" aria-hidden />
                    Cluster Overview
                    <span className="h-1 w-1 rounded-full bg-muted-foreground/40" aria-hidden />
                    Live · {new Date().toLocaleTimeString()}
                </span>
            }
            actions={
                <StatusBadge status={stats.cluster_status.cluster_status} withDot />
            }
        />

        {/* Key resource metrics */}
        <section aria-label="Resource allocation">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
                <MetricCard
                    label="CPU"
                    icon={Zap}
                    tone="primary"
                    value={stats.resources.cpu_allocated}
                    sub={`/ ${stats.resources.cpu_total}`}
                    progress={safePercent(stats.resources.cpu_allocated, stats.resources.cpu_total)}
                    onClick={() => navigate('/jobs')}
                />
                <MetricCard
                    label="Memory"
                    icon={Memory}
                    tone="success"
                    value={`${Math.round(stats.resources.memory_allocated_mb / 1024)}G`}
                    sub={`/ ${Math.round(stats.resources.memory_total_mb / 1024)}G`}
                    progress={safePercent(stats.resources.memory_allocated_mb, stats.resources.memory_total_mb)}
                    onClick={() => navigate('/jobs')}
                />
                <MetricCard
                    label="Nodes"
                    icon={Server}
                    tone="info"
                    value={stats.resources.active_nodes}
                    sub={`/ ${stats.resources.node_count}`}
                    progress={safePercent(stats.resources.active_nodes, stats.resources.node_count)}
                    onClick={() => navigate('/management/node-management')}
                />
                <MetricCard
                    label="Pending Requests"
                    icon={FileQuestion}
                    tone="warning"
                    value={stats.requests.pending_requests}
                    progress={Math.min(stats.requests.pending_requests * 10, 100)}
                    onClick={() => navigate('/requests')}
                />
                {stats.resources.gpu_total > 0 && (
                    <MetricCard
                        label="GPU"
                        icon={Gauge}
                        tone="danger"
                        value={stats.resources.gpu_allocated || 0}
                        sub={`/ ${stats.resources.gpu_total}`}
                        progress={safePercent(stats.resources.gpu_allocated || 0, stats.resources.gpu_total)}
                    />
                )}
            </div>
        </section>

        {/* Job activity */}
        <section aria-label="Job activity" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
            <MetricCard label="Running" icon={Activity} tone="primary" value={<span className="text-lg">{stats.jobs.running}</span>} onClick={() => navigate('/jobs')} />
            <MetricCard label="Pending" icon={Clock} tone="warning" value={<span className="text-lg">{stats.jobs.pending}</span>} sub={<span>/ {stats.jobs.today_count} today</span>} onClick={() => navigate('/jobs')} />
            <MetricCard label="Total Users" icon={Users} tone="info" value={<span className="text-lg">{stats.users.total_users}</span>} onClick={() => navigate('/users')} />
            <MetricCard label="Completed" icon={CheckCircle2} tone="success" value={<span className="text-lg">{stats.jobs.completed}</span>} />
            <MetricCard label="Failed" icon={XCircle} tone="danger" value={<span className="text-lg">{stats.jobs.failed}</span>} />
            <MetricCard label="Cancelled" icon={X} tone="neutral" value={<span className="text-lg">{stats.jobs.cancelled}</span>} />
            <MetricCard label="Total Jobs" icon={History} tone="neutral" value={<span className="text-lg">{stats.jobs.total}</span>} />
        </section>

        {/* Services & utilization */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
                <CardHeader className="border-b border-border px-4 py-3 [.border-b]:pb-3">
                    <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <Activity className="h-3.5 w-3.5 text-primary" aria-hidden />
                        Cluster Services
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 p-4">
                    <dl className="divide-y divide-border">
                        <div className="flex items-center justify-between py-2">
                            <dt className="text-sm text-muted-foreground">Scheduler Controller</dt>
                            <dd><StatusBadge status={stats.cluster_status.slurmctld_status} /></dd>
                        </div>
                        <div className="flex items-center justify-between py-2">
                            <dt className="text-sm text-muted-foreground">Accounting Service</dt>
                            <dd><StatusBadge status={stats.cluster_status.slurmdbd_status} /></dd>
                        </div>
                        <div className="flex items-center justify-between py-2">
                            <dt className="text-sm text-muted-foreground">Last Heartbeat</dt>
                            <dd className="font-mono text-[11px] tabular-nums text-muted-foreground">
                                {new Date(stats.cluster_status.last_heartbeat).toLocaleString()}
                            </dd>
                        </div>
                    </dl>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="border-b border-border px-4 py-3 [.border-b]:pb-3">
                    <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <Gauge className="h-3.5 w-3.5 text-primary" aria-hidden />
                        Utilization
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-4">
                    <div>
                        <div className="mb-1 flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">CPU</span>
                            <span className="text-sm font-medium tabular-nums text-foreground">{stats.utilization.cpu_used_percent}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={stats.utilization.cpu_used_percent} aria-valuemin={0} aria-valuemax={100} aria-label="CPU utilization">
                            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${stats.utilization.cpu_used_percent}%` }} />
                        </div>
                    </div>
                    <div>
                        <div className="mb-1 flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Memory</span>
                            <span className="text-sm font-medium tabular-nums text-foreground">{stats.utilization.memory_used_percent}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={stats.utilization.memory_used_percent} aria-valuemin={0} aria-valuemax={100} aria-label="Memory utilization">
                            <div className="h-full rounded-full bg-success transition-all" style={{ width: `${stats.utilization.memory_used_percent}%` }} />
                        </div>
                    </div>
                    {stats.resources.gpu_total > 0 && (
                        <div>
                            <div className="mb-1 flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">GPU</span>
                                <span className="text-sm font-medium tabular-nums text-foreground">{stats.utilization.gpu_used_percent}%</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={stats.utilization.gpu_used_percent} aria-valuemin={0} aria-valuemax={100} aria-label="GPU utilization">
                                <div className="h-full rounded-full bg-info transition-all" style={{ width: `${stats.utilization.gpu_used_percent}%` }} />
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>

        {/* Quick navigation */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
                type="button"
                onClick={() => navigate('/jobs')}
                className="group flex items-center justify-between rounded-lg border border-border bg-card p-4 text-left shadow-xs transition-colors hover:border-ring/40 hover:bg-accent/40"
            >
                <span className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                        <Layers className="h-4 w-4 text-primary" aria-hidden />
                    </span>
                    <span>
                        <span className="block text-sm font-medium text-foreground">Jobs</span>
                        <span className="block text-xs text-muted-foreground">View and manage all jobs</span>
                    </span>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
            </button>

            <button
                type="button"
                onClick={() => navigate('/management/node-management')}
                className="group flex items-center justify-between rounded-lg border border-border bg-card p-4 text-left shadow-xs transition-colors hover:border-ring/40 hover:bg-accent/40"
            >
                <span className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-info/10">
                        <Server className="h-4 w-4 text-info" aria-hidden />
                    </span>
                    <span>
                        <span className="block text-sm font-medium text-foreground">Nodes</span>
                        <span className="block text-xs text-muted-foreground">Manage compute nodes and services</span>
                    </span>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
            </button>
        </div>
    </div>
  );
}
