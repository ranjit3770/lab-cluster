import { useEffect, useState } from 'react';
import { useAuth } from '@/context/useAuth'
import { userApi } from '@/api/user';
import {
    Cpu,
    MemoryStick as Memory,
    HardDrive,
    Activity,
    CheckCircle2,
    XCircle,
    Clock,
    ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PageLoader from "@/components/PageLoader";
import { StatusBadge } from "@/components/ui/status-badge";
import { MetricCard } from "@/components/shared/MetricCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface UserStats {
    cpu_limit: number;
    memory_limit_gb: number;
    total_jobs: number;
    running_jobs: number;
    pending_jobs: number;
    completed_jobs: number;
    failed_jobs: number;
    cancelled_jobs: number;
    storage_limit_gb: number;
    storage_used_gb: number;
}

export default function UserDashboardPage() {
    const { token, user } = useAuth();
    const navigate = useNavigate();
    const [stats, setStats] = useState<UserStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                if (!token) return;
                const res = await userApi.getDashboardStats(token);
                setStats(res.data);
            } catch (err) {
                console.error("Dashboard error:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, [token]);

    if (loading) return <PageLoader message="Loading dashboard..." />;

    const storagePercentage = stats?.storage_limit_gb
        ? Math.min(100, Math.round((stats.storage_used_gb / stats.storage_limit_gb) * 100))
        : 0;

    return (
        <div className="flex flex-col gap-4 pb-4">
            <PageHeader
                title="Dashboard"
                description={`Welcome back, ${user?.username}`}
                actions={<StatusBadge status="Active" />}
            />

            <section aria-label="Resource limits" className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <MetricCard
                    label="CPU"
                    icon={Cpu}
                    tone="info"
                    value={stats?.cpu_limit || '-'}
                />
                <MetricCard
                    label="Memory"
                    icon={Memory}
                    tone="success"
                    value={`${stats?.memory_limit_gb || '-'}GB`}
                />
                <MetricCard
                    label="Storage"
                    icon={HardDrive}
                    tone="primary"
                    value={`${stats?.storage_limit_gb || '-'}GB`}
                />
                <MetricCard
                    label="Running"
                    icon={Activity}
                    tone="primary"
                    value={stats?.running_jobs || 0}
                />
            </section>

            <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader className="border-b border-border px-4 py-3 [.border-b]:pb-3">
                        <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <Activity className="h-3.5 w-3.5 text-primary" aria-hidden />
                            Jobs
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3">
                        <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-md border border-border bg-muted/50 p-2.5">
                                <div className="flex items-center gap-2">
                                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" aria-hidden />
                                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Running</span>
                                </div>
                                <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{stats?.running_jobs || 0}</div>
                            </div>
                            <div className="rounded-md border border-border bg-muted/50 p-2.5">
                                <div className="flex items-center gap-2">
                                    <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden />
                                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Pending</span>
                                </div>
                                <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{stats?.pending_jobs || 0}</div>
                            </div>
                            <div className="rounded-md border border-border bg-muted/50 p-2.5">
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden />
                                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Completed</span>
                                </div>
                                <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{stats?.completed_jobs || 0}</div>
                            </div>
                            <div className="rounded-md border border-border bg-muted/50 p-2.5">
                                <div className="flex items-center gap-2">
                                    <XCircle className="h-3.5 w-3.5 text-destructive" aria-hidden />
                                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Failed</span>
                                </div>
                                <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{stats?.failed_jobs || 0}</div>
                            </div>
                            <div className="col-span-2 rounded-md border border-border bg-muted/50 p-2.5">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <XCircle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                                        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Cancelled</span>
                                    </div>
                                    <div className="text-lg font-semibold tabular-nums text-foreground">{stats?.cancelled_jobs || 0}</div>
                                </div>
                            </div>
                            <div className="col-span-2 mt-1 rounded-md border border-primary/20 bg-primary/10 p-2.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">Total History</span>
                                    <div className="text-lg font-semibold tabular-nums text-primary">{stats?.total_jobs || 0}</div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="border-b border-border px-4 py-3 [.border-b]:pb-3">
                        <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <HardDrive className="h-3.5 w-3.5 text-primary" aria-hidden />
                            Storage
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">{stats?.storage_used_gb || 0}GB / {stats?.storage_limit_gb || 0}GB</span>
                                <span className="font-medium tabular-nums text-foreground">{storagePercentage}%</span>
                            </div>
                            <div
                                className="h-2 overflow-hidden rounded-full bg-muted"
                                role="progressbar"
                                aria-valuenow={storagePercentage}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-label="Storage usage"
                            >
                                <div
                                    className={cn(
                                        "h-full rounded-full transition-all",
                                        storagePercentage > 90 ? "bg-destructive" :
                                            storagePercentage > 70 ? "bg-warning" : "bg-primary"
                                    )}
                                    style={{ width: `${storagePercentage}%` }}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </section>

            <section aria-label="Quick navigation" className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <button
                    type="button"
                    onClick={() => navigate('/jobs')}
                    className="group flex flex-col items-start gap-2.5 rounded-lg border border-border bg-card p-3 text-left shadow-xs transition-colors hover:border-ring/40 hover:bg-accent/40"
                >
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                        <Activity className="h-4 w-4 text-primary" aria-hidden />
                    </span>
                    <span className="flex w-full items-center justify-between">
                        <span className="text-sm font-medium text-foreground">Jobs</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => navigate('/files')}
                    className="group flex flex-col items-start gap-2.5 rounded-lg border border-border bg-card p-3 text-left shadow-xs transition-colors hover:border-ring/40 hover:bg-accent/40"
                >
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-info/10">
                        <HardDrive className="h-4 w-4 text-info" aria-hidden />
                    </span>
                    <span className="flex w-full items-center justify-between">
                        <span className="text-sm font-medium text-foreground">Files</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => navigate('/requests')}
                    className="group flex flex-col items-start gap-2.5 rounded-lg border border-border bg-card p-3 text-left shadow-xs transition-colors hover:border-ring/40 hover:bg-accent/40"
                >
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10">
                        <Clock className="h-4 w-4 text-warning" aria-hidden />
                    </span>
                    <span className="flex w-full items-center justify-between">
                        <span className="text-sm font-medium text-foreground">Requests</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => navigate('/feedback')}
                    className="group flex flex-col items-start gap-2.5 rounded-lg border border-border bg-card p-3 text-left shadow-xs transition-colors hover:border-ring/40 hover:bg-accent/40"
                >
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10">
                        <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
                    </span>
                    <span className="flex w-full items-center justify-between">
                        <span className="text-sm font-medium text-foreground">Feedback</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                </button>
            </section>
        </div>
    );
}
