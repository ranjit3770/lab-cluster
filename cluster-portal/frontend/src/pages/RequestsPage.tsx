import React, { useEffect, useState } from 'react';
import { requestsApi } from '@/api/requests';
import { userApi } from '@/api/user';
import { useAuth } from '@/context/useAuth'
import { ControllerFailureAlert } from '@/components/ControllerFailureAlert';
import {
    FileQuestion,
    Search,
    RefreshCcw,
    Send,
    Database,
    ChevronDown,
    Cpu,
    HardDrive,
    Zap,
    CheckCircle2,
    XCircle,
    Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { apiErrorMessage } from "@/api/errors";

interface Request {
    id: number;
    request_type: string;
    cpu_cores: number;
    ram_gb: number;
    storage_gb: number;
    status: string;
    created_at: string;
    resolved_at?: string;
    user_id: number;
}

interface UserDashboardStats {
    cpu_limit: number;
    memory_limit_gb: number;
    storage_limit_gb: number;
    storage_used_gb: number;
    total_jobs: number;
    running_jobs: number;
    pending_jobs: number;
    completed_jobs: number;
    failed_jobs: number;
}

export default function RequestsPage() {
    const { token, user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'developer';
    const [requests, setRequests] = useState<Request[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    const [userStats, setUserStats] = useState<UserDashboardStats | null>(null);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (!(event.target as Element).closest('.dropdown-group')) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const [formData, setFormData] = useState({
        request_type: 'resources',
        cpu_cores: 0,
        ram_gb: 0,
        storage_gb: 0
    });

    const handleStatusUpdate = async (id: number, status: string) => {
        try {
            await requestsApi.updateRequest(token!, id, { status });
            toast.success(`Request ${status} successfully.`);
            fetchRequests();
        } catch (err) {
            toast.error(apiErrorMessage(err, "Failed to update request status."));
        }
    };

    const fetchRequests = async () => {
        try {
            setLoading(true);
            setRefreshing(true);
            const res = await requestsApi.getRequests(token!);
            const sortedRequests = [...res.data].sort((a, b) => 
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            setRequests(sortedRequests);
            setError('');
        } catch (err) {
            console.error(err);
            setError(apiErrorMessage(err, "Failed to load requests."));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const fetchUserStats = async () => {
        try {
            const res = await userApi.getDashboardStats(token!);
            setUserStats(res.data);
        } catch (err) {
            console.error("Failed to fetch user stats:", err);
        }
    };

    useEffect(() => {
        fetchRequests();
        fetchUserStats();
    }, [token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        try {
            setSubmitting(true);
            await requestsApi.createRequest(token!, formData);
            toast.success("Request submitted successfully.");
            setFormData({ 
                request_type: 'resources', 
                cpu_cores: 0,
                ram_gb: 0,
                storage_gb: 0
            });
            fetchRequests();
        } catch (err) {
            toast.error(apiErrorMessage(err, "Submission failed."));
        } finally {
            setSubmitting(false);
        }
    };

    const filteredRequests = requests.filter((r: Request) => 
        r.id.toString().includes(search) ||
        (r.request_type && r.request_type.toLowerCase().includes(search.toLowerCase()))
    );

    if (error) return (
        <ControllerFailureAlert 
            error={error} 
            onRetry={fetchRequests} 
        />
    );

    if (loading && requests.length === 0) return (
        <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Loading...</p>
        </div>
    );

    return (
        <div className="flex flex-col pb-4">
            <PageHeader
                title="Requests"
                description={
                    <span className="inline-flex items-center gap-2">
                        <Database className="h-3 w-3" aria-hidden />
                        {isAdmin ? "Manage all requests" : "Submit resource requests"}
                        <span className="h-1 w-1 rounded-full bg-border" aria-hidden />
                        {requests.length} total
                    </span>
                }
                actions={
                    <>
                        {isAdmin && (
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                                <Input
                                    placeholder="Search requests..."
                                    className="h-8 pl-9 text-xs"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    aria-label="Search requests"
                                />
                            </div>
                        )}
                        <Button
                            onClick={fetchRequests}
                            variant="outline"
                            size="sm"
                            className="h-8 px-2"
                            aria-label="Refresh requests"
                        >
                            <RefreshCcw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
                        </Button>
                    </>
                }
            />

            {!isAdmin && (
                <section className="mb-4 rounded-lg border border-border bg-card p-4 shadow-xs">
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Zap className="h-4 w-4 text-primary" aria-hidden />
                        Submit New Request
                    </h2>
                    <form onSubmit={handleSubmit} className="mt-3 space-y-3">
                        {userStats && (
                            <div className="grid grid-cols-3 gap-2">
                                <div className="rounded-md border border-border bg-muted/50 p-2 text-center">
                                    <Cpu className="mx-auto mb-1 h-3 w-3 text-muted-foreground" aria-hidden />
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Current CPU</p>
                                    <p className="text-xs font-semibold tabular-nums text-foreground">{userStats.cpu_limit || 0} cores</p>
                                </div>
                                <div className="rounded-md border border-border bg-muted/50 p-2 text-center">
                                    <HardDrive className="mx-auto mb-1 h-3 w-3 text-muted-foreground" aria-hidden />
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Memory</p>
                                    <p className="text-xs font-semibold tabular-nums text-foreground">{userStats.memory_limit_gb || 0} GB</p>
                                </div>
                                <div className="rounded-md border border-border bg-muted/50 p-2 text-center">
                                    <Database className="mx-auto mb-1 h-3 w-3 text-muted-foreground" aria-hidden />
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Storage</p>
                                    <p className="text-xs font-semibold tabular-nums text-foreground">{userStats.storage_limit_gb || 0} GB</p>
                                </div>
                            </div>
                        )}

                        <div className="relative dropdown-group">
                            <div
                                className={cn(
                                    "flex cursor-pointer items-center justify-between rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent/40",
                                    isDropdownOpen && "border-primary/50 ring-2 ring-primary/40"
                                )}
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            >
                                <span>
                                    {formData.request_type === 'resources' ? "Cluster Resources" : "Storage Expansion"}
                                </span>
                                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isDropdownOpen && "rotate-180")} />
                            </div>
                            {isDropdownOpen && (
                                <div className="absolute left-0 top-full z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover py-1 shadow-sm">
                                    <div
                                        className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-popover-foreground hover:bg-accent"
                                        onClick={() => {
                                            setFormData({...formData, request_type: 'resources'});
                                            setIsDropdownOpen(false);
                                        }}
                                    >
                                        <Cpu className="h-4 w-4" /> Cluster Resources
                                    </div>
                                    <div
                                        className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-popover-foreground hover:bg-accent"
                                        onClick={() => {
                                            setFormData({...formData, request_type: 'storage'});
                                            setIsDropdownOpen(false);
                                        }}
                                    >
                                        <HardDrive className="h-4 w-4" /> Storage Expansion
                                    </div>
                                </div>
                            )}
                        </div>

                        {formData.request_type === 'resources' && (
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label htmlFor="req-cpu-cores" className="text-xs font-medium text-foreground">CPU Cores</Label>
                                    <Input
                                        id="req-cpu-cores"
                                        type="number"
                                        placeholder="0"
                                        className="mt-1 h-9"
                                        value={formData.cpu_cores || ''}
                                        onChange={(e) => setFormData({...formData, cpu_cores: parseInt(e.target.value) || 0})}
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="req-ram-gb" className="text-xs font-medium text-foreground">RAM (GB)</Label>
                                    <Input
                                        id="req-ram-gb"
                                        type="number"
                                        placeholder="0"
                                        className="mt-1 h-9"
                                        value={formData.ram_gb || ''}
                                        onChange={(e) => setFormData({...formData, ram_gb: parseInt(e.target.value) || 0})}
                                    />
                                </div>
                            </div>
                        )}

                        {formData.request_type === 'storage' && (
                            <div>
                                <Label htmlFor="req-storage-gb" className="text-xs font-medium text-foreground">Storage (GB)</Label>
                                <Input
                                    id="req-storage-gb"
                                    type="number"
                                    placeholder="0"
                                    className="mt-1 h-9"
                                    value={formData.storage_gb || ''}
                                    onChange={(e) => setFormData({...formData, storage_gb: parseInt(e.target.value) || 0})}
                                />
                            </div>
                        )}

                        <Button
                            type="submit"
                            disabled={submitting}
                            className="w-full"
                        >
                            {submitting ? (
                                <RefreshCcw className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Send className="mr-2 h-4 w-4" />
                            )}
                            {submitting ? 'Submitting...' : 'Submit Request'}
                        </Button>
                    </form>
                </section>
            )}

            {filteredRequests.length === 0 ? (
                <EmptyState
                    icon={FileQuestion}
                    title="No requests found"
                    description="No resource or storage requests match your search."
                />
            ) : (
                <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-border bg-muted/50">
                                    <th className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">ID</th>
                                    <th className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Type</th>
                                    <th className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Details</th>
                                    <th className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</th>
                                    <th className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Date</th>
                                    {isAdmin && <th className="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Actions</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {filteredRequests.map((r: Request) => (
                                    <tr key={r.id} className="transition-colors hover:bg-accent/40">
                                        <td className="px-3 py-2.5">
                                            <span className="text-sm font-medium tabular-nums text-foreground">#{r.id}</span>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <Badge variant="outline" size="sm">{r.request_type}</Badge>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <span className="text-xs text-muted-foreground">
                                                {r.request_type === 'resources' ? (
                                                    <span>CPU: {r.cpu_cores}, RAM: {r.ram_gb}GB</span>
                                                ) : (
                                                    <span>Storage: {r.storage_gb}GB</span>
                                                )}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <StatusBadge status={r.status} />
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <span className="text-xs tabular-nums text-muted-foreground">
                                                {new Date(r.created_at).toLocaleDateString()}
                                            </span>
                                        </td>
                                        {isAdmin && r.status === 'pending' && (
                                            <td className="px-3 py-2.5">
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button
                                                        onClick={() => handleStatusUpdate(r.id, 'approved')}
                                                        size="sm"
                                                        variant="success"
                                                        className="h-7 px-2 text-[11px]"
                                                    >
                                                        <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                                                    </Button>
                                                    <Button
                                                        onClick={() => handleStatusUpdate(r.id, 'rejected')}
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 px-2 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                    >
                                                        <XCircle className="h-3 w-3 mr-1" /> Reject
                                                    </Button>
                                                </div>
                                            </td>
                                        )}
                                        {isAdmin && r.status !== 'pending' && (
                                            <td className="px-3 py-2.5 text-right">
                                                <span className="text-xs text-muted-foreground">-</span>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
