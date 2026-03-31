import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { userApi } from '@/api/user';
import { 
    Cpu, 
    MemoryStick as Memory, 
    HardDrive,
    Activity,
    CheckCircle2,
    XCircle,
    Clock
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

    if (loading) return (
        <div className="flex items-center justify-center h-full gap-3">
            <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            <span className="text-xs text-muted-foreground uppercase">Loading...</span>
        </div>
    );

    const storagePercentage = stats?.storage_limit_gb 
        ? Math.min(100, Math.round((stats.storage_used_gb / stats.storage_limit_gb) * 100)) 
        : 0;

    return (
        <div className="flex flex-col gap-3 pb-4 selection:bg-primary/30 animate-in fade-in duration-300">
            <header className="page-header flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                    <h1 className="page-title text-xl lg:text-2xl font-bold text-white">Dashboard</h1>
                    <p className="page-subtitle text-xs text-muted-foreground mt-1">Welcome back, {user?.username}</p>
                </div>
                <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-medium text-emerald-500 uppercase">Active</span>
                </div>
            </header>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Card className="p-3 border-white/5 bg-white/[0.02]">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-md bg-blue-500/10">
                                <Cpu className="h-3.5 w-3.5 text-blue-500" />
                            </div>
                            <span className="text-[10px] font-medium text-muted-foreground uppercase">CPU</span>
                        </div>
                    </div>
                    <div className="text-xl font-bold mt-2">{stats?.cpu_limit || '-'}</div>
                </Card>

                <Card className="p-3 border-white/5 bg-white/[0.02]">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-md bg-emerald-500/10">
                                <Memory className="h-3.5 w-3.5 text-emerald-500" />
                            </div>
                            <span className="text-[10px] font-medium text-muted-foreground uppercase">Memory</span>
                        </div>
                    </div>
                    <div className="text-xl font-bold mt-2">{stats?.memory_limit_gb || '-'}GB</div>
                </Card>

                <Card className="p-3 border-white/5 bg-white/[0.02]">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-md bg-purple-500/10">
                                <HardDrive className="h-3.5 w-3.5 text-purple-500" />
                            </div>
                            <span className="text-[10px] font-medium text-muted-foreground uppercase">Storage</span>
                        </div>
                    </div>
                    <div className="text-xl font-bold mt-2">{stats?.storage_limit_gb || '-'}GB</div>
                </Card>

                <Card className="p-3 border-white/5 bg-white/[0.02]">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-md bg-primary/10">
                                <Activity className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <span className="text-[10px] font-medium text-muted-foreground uppercase">Running</span>
                        </div>
                    </div>
                    <div className="text-xl font-bold mt-2">{stats?.running_jobs || 0}</div>
                </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Card className="p-4 border-white/5 bg-white/[0.02]">
                    <CardHeader className="p-0 pb-2">
                        <CardTitle className="text-sm font-semibold">Jobs</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="grid grid-cols-2 gap-2">
                            <div className="p-2 rounded-md bg-white/5 border border-white/5">
                                <div className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                                    <span className="text-[10px] text-muted-foreground uppercase">Running</span>
                                </div>
                                <div className="text-lg font-bold">{stats?.running_jobs || 0}</div>
                            </div>
                            <div className="p-2 rounded-md bg-white/5 border border-white/5">
                                <div className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-amber-500" />
                                    <span className="text-[10px] text-muted-foreground uppercase">Pending</span>
                                </div>
                                <div className="text-lg font-bold">{stats?.pending_jobs || 0}</div>
                            </div>
                            <div className="p-2 rounded-md bg-white/5 border border-white/5">
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                    <span className="text-[10px] text-muted-foreground uppercase">Completed</span>
                                </div>
                                <div className="text-lg font-bold">{stats?.completed_jobs || 0}</div>
                            </div>
                            <div className="p-2 rounded-md bg-white/5 border border-white/5">
                                <div className="flex items-center gap-2">
                                    <XCircle className="h-3 w-3 text-rose-500" />
                                    <span className="text-[10px] text-muted-foreground uppercase">Failed</span>
                                </div>
                                <div className="text-lg font-bold">{stats?.failed_jobs || 0}</div>
                            </div>
                            <div className="p-2 rounded-md bg-white/5 border border-amber-500/20 col-span-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <XCircle className="h-3 w-3 text-muted-foreground" />
                                        <span className="text-[10px] text-muted-foreground uppercase">Cancelled</span>
                                    </div>
                                    <div className="text-lg font-bold">{stats?.cancelled_jobs || 0}</div>
                                </div>
                            </div>
                            <div className="p-2 rounded-md bg-primary/10 border border-primary/20 col-span-2 mt-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-primary uppercase">Total History</span>
                                    <div className="text-lg font-bold text-primary">{stats?.total_jobs || 0}</div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="p-4 border-white/5 bg-white/[0.02]">
                    <CardHeader className="p-0 pb-2">
                        <CardTitle className="text-sm font-semibold">Storage</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">{stats?.storage_used_gb || 0}GB / {stats?.storage_limit_gb || 0}GB</span>
                                <span className="text-muted-foreground">{storagePercentage}%</span>
                            </div>
                            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                <div 
                                    className={cn(
                                        "h-full rounded-full",
                                        storagePercentage > 90 ? "bg-rose-500" : 
                                        storagePercentage > 70 ? "bg-amber-500" : "bg-purple-500"
                                    )}
                                    style={{ width: `${storagePercentage}%` }}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Button onClick={() => navigate('/jobs')} size="sm" variant="outline" className="h-16">
                    <Activity className="h-4 w-4 mr-2" />
                    <span className="text-xs">Jobs</span>
                </Button>
                <Button onClick={() => navigate('/files')} size="sm" variant="outline" className="h-16">
                    <HardDrive className="h-4 w-4 mr-2" />
                    <span className="text-xs">Files</span>
                </Button>
                <Button onClick={() => navigate('/requests')} size="sm" variant="outline" className="h-16">
                    <Clock className="h-4 w-4 mr-2" />
                    <span className="text-xs">Requests</span>
                </Button>
                <Button onClick={() => navigate('/feedback')} size="sm" variant="outline" className="h-16">
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    <span className="text-xs">Feedback</span>
                </Button>
            </div>
        </div>
    );
}
