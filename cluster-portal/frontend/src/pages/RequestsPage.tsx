import React, { useEffect, useState } from 'react';
import { requestsApi } from '@/api/requests';
import { userApi } from '@/api/user';
import { useAuth } from '@/context/AuthContext';
import { ControllerFailureAlert } from '@/components/ControllerFailureAlert';
import { 
    FileQuestion, 
    Search, RefreshCcw,
    Send, Info, Box,
    ChevronDown,
    Cpu,
    HardDrive,
    Database,
    Zap,
    Shield,
    Clock,
    CheckCircle2,
    XCircle,
    ArrowRight,
    ArrowUpRight,
    LayoutGrid,
    Monitor,
    HandMetal,
    Signal,
    Globe,
    ShieldCheck,
    Command,
    Fingerprint,
    Orbit,
    Power,
    History,
    Network,
    Cpu as CpuIcon,
    Scan,
    Sparkles,
    Loader2
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
        } catch (err: any) {
            const detail = err.response?.data?.detail;
            const message = typeof detail === 'string' ? detail : 
                          Array.isArray(detail) && typeof detail[0]?.msg === 'string' ? detail[0].msg :
                          typeof detail === 'object' ? JSON.stringify(detail) :
                          err.message || `Failed to update request status.`;
            toast.error(message);
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
        } catch (err: any) {
            console.error(err);
            const detail = err.response?.data?.detail;
            const message = typeof detail === 'string' ? detail : 
                          Array.isArray(detail) && typeof detail[0]?.msg === 'string' ? detail[0].msg :
                          err.message || "Failed to load requests.";
            setError(message);
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
        } catch (err: any) {
            toast.error(err.response?.data?.detail || "Submission failed.");
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
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <p className="text-sm text-gray-500 uppercase tracking-wide">Loading...</p>
        </div>
    );

    return (
        <div className="flex flex-col gap-4 pb-4 max-w-[1800px] mx-auto w-full animate-in fade-in duration-300">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                    <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Requests</h1>
                    <p className="text-xs text-gray-500 flex items-center gap-2 mt-1">
                        <Database className="h-3 w-3" />
                        {isAdmin ? "Manage all requests" : "Submit resource requests"}
                        <span className="h-1 w-1 rounded-full bg-gray-300" />
                        {requests.length} total
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {isAdmin && (
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input 
                                placeholder="Search requests..." 
                                className="pl-9 h-9 bg-white border-gray-200 rounded-lg text-sm w-48"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    )}
                    <Button 
                        onClick={fetchRequests}
                        variant="outline"
                        size="sm"
                        className="h-9"
                    >
                        <RefreshCcw className={cn("h-4 w-4", refreshing && "animate-spin")} />
                    </Button>
                </div>
            </header>

            {!isAdmin && (
            <Card className="bg-white border-gray-200 p-4">
                    <CardHeader className="p-0 pb-3">
                        <CardTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                            <Zap className="h-4 w-4 text-primary" />
                            Submit New Request
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <form onSubmit={handleSubmit} className="space-y-3">
                            {userStats && (
                                <div className="flex gap-2 mb-3">
                                    <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg p-2 text-center">
                                        <Cpu className="h-3 w-3 mx-auto text-gray-400 mb-1" />
                                        <p className="text-[9px] text-gray-500 uppercase">Current CPU</p>
                                        <p className="text-xs font-bold text-gray-900">{userStats.cpu_limit || 0} cores</p>
                                    </div>
                                    <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg p-2 text-center">
                                        <HardDrive className="h-3 w-3 mx-auto text-gray-400 mb-1" />
                                        <p className="text-[9px] text-gray-500 uppercase">Memory</p>
                                        <p className="text-xs font-bold text-gray-900">{userStats.memory_limit_gb || 0} GB</p>
                                    </div>
                                    <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg p-2 text-center">
                                        <Database className="h-3 w-3 mx-auto text-gray-400 mb-1" />
                                        <p className="text-[9px] text-gray-500 uppercase">Storage</p>
                                        <p className="text-xs font-bold text-gray-900">{userStats.storage_limit_gb || 0} GB</p>
                                    </div>
                                </div>
                            )}

                            <div className="relative dropdown-group">
                                <div 
                                    className={cn(
                                        "flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer text-sm",
                                        isDropdownOpen ? "ring-2 ring-primary/30" : ""
                                    )}
                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                >
                                    <span className="text-gray-700">
                                        {formData.request_type === 'resources' ? "Cluster Resources" : "Storage Expansion"}
                                    </span>
                                    <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform", isDropdownOpen && "rotate-180")} />
                                </div>
                                {isDropdownOpen && (
                                    <div className="absolute top-full left-0 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1">
                                        <div 
                                            className="px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm text-gray-700 flex items-center gap-2"
                                            onClick={() => {
                                                setFormData({...formData, request_type: 'resources'});
                                                setIsDropdownOpen(false);
                                            }}
                                        >
                                            <Cpu className="h-4 w-4" /> Cluster Resources
                                        </div>
                                        <div 
                                            className="px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm text-gray-700 flex items-center gap-2"
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
                                        <Label className="text-[10px] font-medium text-gray-500 uppercase">CPU Cores</Label>
                                        <Input 
                                            type="number"
                                            placeholder="0"
                                            className="h-10 mt-1 bg-gray-50 border-gray-200"
                                            value={formData.cpu_cores || ''}
                                            onChange={(e) => setFormData({...formData, cpu_cores: parseInt(e.target.value) || 0})}
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-[10px] font-medium text-gray-500 uppercase">RAM (GB)</Label>
                                        <Input 
                                            type="number"
                                            placeholder="0"
                                            className="h-10 mt-1 bg-gray-50 border-gray-200"
                                            value={formData.ram_gb || ''}
                                            onChange={(e) => setFormData({...formData, ram_gb: parseInt(e.target.value) || 0})}
                                        />
                                    </div>
                                </div>
                            )}

                            {formData.request_type === 'storage' && (
                                <div>
                                    <Label className="text-[10px] font-medium text-gray-500 uppercase">Storage (GB)</Label>
                                    <Input 
                                        type="number"
                                        placeholder="0"
                                        className="h-10 mt-1 bg-gray-50 border-gray-200"
                                        value={formData.storage_gb || ''}
                                        onChange={(e) => setFormData({...formData, storage_gb: parseInt(e.target.value) || 0})}
                                    />
                                </div>
                            )}

                            <Button 
                                type="submit" 
                                disabled={submitting}
                                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                            >
                                {submitting ? (
                                    <RefreshCcw className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Send className="mr-2 h-4 w-4" />
                                )}
                                {submitting ? 'Submitting...' : 'Submit Request'}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            )}

            <Card className="bg-white border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase">ID</th>
                                <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase">Type</th>
                                <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase">Details</th>
                                <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase">Status</th>
                                <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase">Date</th>
                                {isAdmin && <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase">Actions</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredRequests.length === 0 ? (
                                <tr>
                                    <td colSpan={isAdmin ? 6 : 5} className="px-4 py-12 text-center text-sm text-gray-400">
                                        No requests found
                                    </td>
                                </tr>
                            ) : (
                                filteredRequests.map((r: Request) => (
                                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3">
                                            <span className="text-sm font-medium text-gray-900">#{r.id}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge variant="outline" className="text-[10px]">
                                                {r.request_type}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="text-xs text-gray-600">
                                                {r.request_type === 'resources' ? (
                                                    <span>CPU: {r.cpu_cores}, RAM: {r.ram_gb}GB</span>
                                                ) : (
                                                    <span>Storage: {r.storage_gb}GB</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge 
                                                className={cn(
                                                    "text-[10px]",
                                                    r.status === 'approved' ? "bg-emerald-100 text-emerald-700" :
                                                    r.status === 'rejected' ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
                                                )}
                                            >
                                                {r.status}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-xs text-gray-500">
                                                {new Date(r.created_at).toLocaleDateString()}
                                            </span>
                                        </td>
                                        {isAdmin && r.status === 'pending' && (
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <Button 
                                                        onClick={() => handleStatusUpdate(r.id, 'approved')}
                                                        size="sm"
                                                        className="h-7 px-2 text-[10px] bg-emerald-500 hover:bg-emerald-600"
                                                    >
                                                        <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                                                    </Button>
                                                    <Button 
                                                        onClick={() => handleStatusUpdate(r.id, 'rejected')}
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 px-2 text-[10px] border-rose-200 text-rose-600 hover:bg-rose-50"
                                                    >
                                                        <XCircle className="h-3 w-3 mr-1" /> Reject
                                                    </Button>
                                                </div>
                                            </td>
                                        )}
                                        {isAdmin && r.status !== 'pending' && (
                                            <td className="px-4 py-3">
                                                <span className="text-xs text-gray-400">-</span>
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
