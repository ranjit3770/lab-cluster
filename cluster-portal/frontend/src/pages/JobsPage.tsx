import React, { useEffect, useState, useRef } from 'react';
import { jobsApi } from '@/api/jobs';
import { filesApi } from '@/api/files';
import { useAuth } from '@/context/AuthContext';
import { ControllerFailureAlert } from '@/components/ControllerFailureAlert';
import { 
    Search, FileText, RefreshCcw, Activity, User, Trash2,
    BarChart3, Monitor, Layers, FileJson,
    XCircle, Clock, Terminal, ChevronRight, Zap, Play, Plus, Trash,
    ArrowRight,
    ArrowUpRight,
    Command,
    Info,
    Signal,
    Orbit,
    Power,
    History,
    Network,
    Globe,
    Lock,
    Unlock,
    ShieldCheck,
    Cpu,
    Database,
    Loader2,
    Scan,
    Sparkles,
    X
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
} from "@/components/ui/alert-dialog";

interface Job {
    id: number;
    job_name: string;
    script_path: string;
    slurm_job_id?: string;
    status: string;
    created_at: string;
    output_log?: string;
    error_log?: string;
    owner?: {
        username: string;
        role: string;
    };
}

interface FileItem {
    name: string;
    path: string;
    isFolder: boolean;
}

export default function JobsPage() {
    const { token, user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'developer';
    const [jobs, setJobs] = useState<Job[]>([]);
    const [scripts, setScripts] = useState<FileItem[]>([]);
    const [textFiles, setTextFiles] = useState<FileItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');

    const [formData, setFormData] = useState({
        job_name: '',
        script_path: '',
        requirements_path: '',
        dependency_path: '',
        total_cpu: 1,
        total_ram: 1,
        walltime: '01:00:00'
    });

    const [jupyterResources, setJupyterResources] = useState({
        total_cpu: 1,
        total_ram: 1,
        walltime: '04:00:00'
    });

    const [quotas, setQuotas] = useState({
        cpu_limit: 0,
        memory_limit_gb: 0,
        cpu_used: 0,
        ram_used: 0
    });

    const [monitoringJob, setMonitoringJob] = useState<Job | null>(null);
    const [liveLogs, setLiveLogs] = useState<string>('');
    const [isLive, setIsLive] = useState<boolean>(false);
    const [jobToDelete, setJobToDelete] = useState<Job | null>(null);
    const [jobToStop, setJobToStop] = useState<Job | null>(null);
    
    // Custom Dropdown States
    const [openDropdown, setOpenDropdown] = useState<'script' | 'req' | 'dep' | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const reqDropdownRef = useRef<HTMLDivElement>(null);

    // Click outside handler
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (openDropdown && 
                ((dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) && 
                 (reqDropdownRef.current && !reqDropdownRef.current.contains(event.target as Node)))) {
                setOpenDropdown(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [openDropdown]);

    const fetchJobs = async (quiet = false) => {
        try {
            if (!quiet) setLoading(true);
            setRefreshing(true);
            const res = await jobsApi.getJobs(token!);
            setJobs(res.data);
            setError('');
        } catch (err: any) {
            console.error(err);
            setError(err.response?.data?.detail || err.message || "Failed to synchronize job registry.");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const fetchScripts = async () => {
        try {
            const res = await filesApi.getFileTree(token!);
            const tree: FileItem[] = res.data;
            
            const isExcluded = (path: string) => {
                const parts = path.split('/');
                return parts.some(p => [
                    'venv', '.venv', 'env', '.env', 'bin', 'lib', 'include', 
                    'Lib', 'Scripts', 'site-packages', 'jobs', '__pycache__', '.git'
                ].includes(p));
            };

            const pyFiles = tree.filter(f => !f.isFolder && f.name.endsWith('.py') && !isExcluded(f.path));
            const txtFiles = tree.filter(f => !f.isFolder && f.name.endsWith('.txt') && !isExcluded(f.path));

            setScripts(pyFiles);
            setTextFiles(txtFiles);
        } catch (err) {
            console.error("Failed to fetch script tree:", err);
            toast.error("Telemetry failure: Could not map cluster storage hierarchy.");
        }
    };

    const fetchQuotas = async () => {
        try {
            const { userApi } = await import('@/api/user');
            const res = await userApi.getDashboardStats(token!);
            setQuotas(prev => ({
                ...prev,
                cpu_limit: res.data.cpu_limit,
                memory_limit_gb: res.data.memory_limit_gb
            }));
        } catch (err) {
            console.error("Failed to fetch quotas:", err);
        }
    };

    useEffect(() => {
        fetchJobs();
        fetchScripts();
        fetchQuotas();
    }, [token]);

    useEffect(() => {
        // Update used calculation when jobs list changes
        setQuotas(prev => ({
            ...prev,
            cpu_used: jobs.filter(j => ['pending', 'running'].includes(j.status)).reduce((acc, j: any) => acc + (j.total_cpu || 0), 0),
            ram_used: jobs.filter(j => ['pending', 'running'].includes(j.status)).reduce((acc, j: any) => acc + (j.total_ram || 0), 0)
        }));
    }, [jobs]);

    const stats = {
        pending: jobs.filter(j => j.status === 'pending').length,
        running: jobs.filter(j => j.status === 'running').length,
        completed: jobs.filter(j => j.status === 'completed').length,
        failed: jobs.filter(j => j.status === 'failed').length,
        cancelled: jobs.filter(j => j.status === 'cancelled').length
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.job_name || !formData.script_path) {
            toast.error("Please provide both a job name and a script context.");
            return;
        }

        const nameExists = jobs.some(j => 
            j.job_name.toLowerCase() === formData.job_name.toLowerCase() && 
            ['pending', 'running'].includes(j.status)
        );

        if (nameExists) {
            toast.error(`"${formData.job_name}" is currently active. Use a unique designation to avoid telemetry collisions.`);
            return;
        }

        // Wall Time Validation
        const timeRegex = /^([0-9]{2}):([0-9]{2}):([0-9]{2})$/;
        if (!timeRegex.test(formData.walltime)) {
            toast.error("Invalid Wall Time format. Please use HH:MM:SS (e.g., 01:00:00).");
            return;
        }

        // Resource Validation
        if (!isAdmin && formData.total_cpu > quotas.cpu_limit) {
            toast.error(`Requested CPU (${formData.total_cpu}) exceeds your quota (${quotas.cpu_limit})`);
            return;
        }
        if (!isAdmin && formData.total_ram > quotas.memory_limit_gb) {
            toast.error(`Requested RAM (${formData.total_ram}GB) exceeds your quota (${quotas.memory_limit_gb}GB)`);
            return;
        }

        try {
            setSubmitting(true);
            await jobsApi.submitJob(token!, {
                ...formData,
                total_cpu: Number(formData.total_cpu),
                total_ram: Number(formData.total_ram)
            });
            
            toast.success("Job dispatched to external slurm orchestrator.");
            setFormData({ 
                job_name: '', 
                script_path: '', 
                requirements_path: '', 
                dependency_path: '',
                total_cpu: 1,
                total_ram: 1,
                walltime: '01:00:00'
            });
            fetchJobs(true);
        } catch (err: any) {
            toast.error(err.response?.data?.detail || "Job submission failed.");
        } finally {
            setSubmitting(false);
        }
    };

    const filteredJobs = jobs.filter(j => 
        j.job_name.toLowerCase().includes(search.toLowerCase()) ||
        (j.script_path && j.script_path.toLowerCase().includes(search.toLowerCase())) ||
        j.id.toString().includes(search)
    );

    const handleDeleteJob = (job: Job) => {
        setJobToDelete(job);
    };

    const confirmDeleteJob = async () => {
        if (!jobToDelete) return;
        const targetId = jobToDelete.id;
        try {
            setJobs(prev => prev.filter(j => j.id !== targetId));
            await jobsApi.deleteJob(token!, targetId);
            toast.success("Job record purged successfully.");
            setJobToDelete(null);
            fetchJobs(true);
        } catch (err: any) {
            toast.error("Cleanup failed: " + (err.response?.data?.detail || err.message));
            fetchJobs(true);
        }
    };

    const confirmStopJob = async () => {
        if (!jobToStop) return;
        try {
            await jobsApi.stopJob(token!, jobToStop.id);
            toast.success("Workload termination signaled.");
            setJobToStop(null);
            fetchJobs(true);
        } catch (err: any) {
            toast.error("Stop signal failed: " + (err.response?.data?.detail || err.message));
        }
    };

    const handleLaunchJupyter = async () => {
        try {
            // Resource Validation
            // Wall Time Validation
            const timeRegex = /^([0-9]{2}):([0-9]{2}):([0-9]{2})$/;
            if (!timeRegex.test(jupyterResources.walltime)) {
                toast.error("Invalid Wall Time format. Please use HH:MM:SS (e.g., 04:00:00).");
                return;
            }

            if (!isAdmin && jupyterResources.total_cpu > quotas.cpu_limit) {
                toast.error(`Requested CPU (${jupyterResources.total_cpu}) exceeds your quota (${quotas.cpu_limit})`);
                return;
            }
            if (!isAdmin && jupyterResources.total_ram > quotas.memory_limit_gb) {
                toast.error(`Requested RAM (${jupyterResources.total_ram}GB) exceeds your quota (${quotas.memory_limit_gb}GB)`);
                return;
            }

            const jupyterData = {
                job_name: `Jupyter_Lab_${new Date().getTime().toString().slice(-4)}`,
                script_path: '__jupyter__',
                requirements_path: '',
                dependency_path: '',
                total_cpu: Number(jupyterResources.total_cpu),
                total_ram: Number(jupyterResources.total_ram),
                walltime: jupyterResources.walltime
            };
            await jobsApi.submitJob(token!, jupyterData);
            toast.success("Jupyter Lab environment dispatched to compute node.");
            setTimeout(() => fetchJobs(true), 500);
        } catch (err: any) {
            toast.error(err.response?.data?.detail || "Jupyter launch failed.");
        } finally {
            setSubmitting(false);
        }
    };

    const streamAbortController = useRef<AbortController | null>(null);

    const startStream = async () => {
        if (!monitoringJob) return;
        if (streamAbortController.current) {
            streamAbortController.current.abort();
        }
        const controller = new AbortController();
        streamAbortController.current = controller;

        try {
            setIsLive(true);
            setLiveLogs(''); 
            const jobApiUrl = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`;
            const response = await fetch(`${jobApiUrl}/api/v1/jobs/${monitoringJob.id}/logs`, {
                headers: { 'Authorization': `Bearer ${token}` },
                signal: controller.signal
            });
            if (!response.ok) throw new Error("Stream connection failed");
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            if (!reader) return;
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                setLiveLogs(prev => prev + chunk);
            }
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                console.error("Slurm Stream Interface Error:", err);
                setLiveLogs(monitoringJob?.output_log || monitoringJob?.error_log || '');
            }
        } finally {
            if (streamAbortController.current === controller) {
                setIsLive(false);
            }
        }
    };

    useEffect(() => {
        if (!monitoringJob) {
            setLiveLogs('');
            setIsLive(false);
            if (streamAbortController.current) {
                streamAbortController.current.abort();
            }
            return;
        }
        startStream();
        return () => {
            if (streamAbortController.current) {
                streamAbortController.current.abort();
            }
        };
    }, [monitoringJob]);

    if (error) return (
        <ControllerFailureAlert error={error} onRetry={fetchJobs} />
    );

    if (loading && jobs.length === 0) return (
        <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] gap-8">
            <div className="relative">
                <Loader2 className="h-24 w-24 text-primary animate-spin" />
                <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
            </div>
            <p className="mt-6 text-muted-foreground/30 font-black uppercase tracking-[0.6em] text-[11px] animate-pulse italic">Syncing Slurm Registry...</p>
        </div>
    );

    const JobList = ({ showHeader = true }) => (
        <div className="flex flex-col h-full gap-3">
            {showHeader && (
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-semibold text-gray-900">Jobs</h2>
                        <p className="text-xs text-muted-foreground">{filteredJobs.length} total</p>
                    </div>
                    <Button 
                         onClick={() => fetchJobs()}
                         size="sm"
                         variant="outline"
                         className={cn(refreshing && "animate-spin")}
                    >
                        <RefreshCcw className="h-3.5 w-3.5" />
                    </Button>
                </div>
            )}
            
            <Card className="overflow-hidden border-white/5 bg-white/[0.02] flex-1">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-white/5">
                                <th className="px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Job</th>
                                {isAdmin && (
                                    <th className="px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Owner</th>
                                )}
                                <th className="px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider text-center">Status</th>
                                {isAdmin && (
                                    <th className="px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Script</th>
                                )}
                                <th className="px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredJobs.length === 0 ? (
                                <tr>
                                    <td colSpan={isAdmin ? 5 : 3} className="px-3 py-12 text-center">
                                        <div className="text-xs text-muted-foreground">No jobs found</div>
                                    </td>
                                </tr>
                            ) : (
                                filteredJobs.map((j) => (
                                    <tr key={j.id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="px-3 py-2.5">
                                            <div className="flex items-center gap-2.5">
                                                <div className="h-8 w-8 flex items-center justify-center bg-white/5 rounded-md">
                                                    <Terminal className={cn("h-4 w-4", j.status === 'running' ? "text-primary animate-pulse" : "text-muted-foreground")} />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-medium text-gray-900">{j.job_name}</div>
                                                    <div className="text-[10px] text-muted-foreground">{j.slurm_job_id ? `#${j.slurm_job_id}` : `ID: ${j.id}`}</div>
                                                </div>
                                            </div>
                                        </td>
                                        {isAdmin && (
                                            <td className="px-3 py-2.5">
                                                <span className="text-xs text-muted-foreground">{j.owner?.username || '-'}</span>
                                            </td>
                                        )}
                                        <td className="px-3 py-2.5 text-center">
                                            <span className={cn(
                                                "text-[10px] font-medium uppercase px-2 py-0.5 rounded",
                                                j.status === 'running' ? "bg-primary/10 text-primary" :
                                                j.status === 'completed' ? "bg-emerald-500/10 text-emerald-500" :
                                                j.status === 'failed' ? "bg-rose-500/10 text-rose-500" : 
                                                j.status === 'cancelled' ? "bg-white/5 text-muted-foreground" : "bg-white/5 text-muted-foreground"
                                            )}>
                                                {j.status}
                                            </span>
                                        </td>
                                        {isAdmin && (
                                            <td className="px-3 py-2.5">
                                                <span className="text-xs text-muted-foreground truncate max-w-[150px] block">{j.script_path?.split('/').pop() || '-'}</span>
                                            </td>
                                        )}
                                        <td className="px-3 py-2.5 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button 
                                                    onClick={() => setMonitoringJob(j)}
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7"
                                                >
                                                    <Monitor className="h-3.5 w-3.5" />
                                                </Button>
                                                
                                                {['running', 'pending'].includes(j.status) ? (
                                                    <Button 
                                                        onClick={() => setJobToStop(j)}
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 text-amber-500"
                                                    >
                                                        <XCircle className="h-3.5 w-3.5" />
                                                    </Button>
                                                ) : (
                                                    <Button 
                                                        onClick={() => handleDeleteJob(j)}
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 text-rose-500"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );

    return (
        <div className="flex flex-col gap-3 pb-4 selection:bg-primary/30 max-w-[1900px] mx-auto w-full animate-in fade-in duration-300">
            <header className="page-header flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                    <h1 className="page-title text-xl lg:text-2xl font-bold text-gray-900">Jobs</h1>
                    <p className="page-subtitle text-xs text-muted-foreground mt-1">
                        {isAdmin ? "Manage all cluster jobs" : "View and submit jobs"}
                    </p>
                </div>
                {isAdmin && (
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input 
                            placeholder="Search jobs..." 
                            className="pl-9 h-8 bg-white/5 border-white/5 text-xs rounded-md"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                )}
            </header>

            {isAdmin && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {[
                        { label: 'Running', count: stats.running, color: 'text-primary', bg: 'bg-primary/10' },
                        { label: 'Pending', count: stats.pending, color: 'text-amber-500', bg: 'bg-amber-500/10' },
                        { label: 'Completed', count: stats.completed, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                        { label: 'Failed', count: stats.failed, color: 'text-rose-500', bg: 'bg-rose-500/10' },
                        { label: 'Cancelled', count: stats.cancelled, color: 'text-muted-foreground', bg: 'bg-white/5' },
                    ].map((s) => (
                        <Card key={s.label} className={cn("p-3 border-white/5", s.bg)}>
                            <div className="flex items-center justify-between">
                                <span className={cn("text-[10px] font-medium uppercase", s.color)}>{s.label}</span>
                            </div>
                            <div className="text-2xl font-bold mt-1">{s.count}</div>
                        </Card>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                {!isAdmin && (
                    <div className="lg:col-span-4 flex flex-col h-full gap-3">
                        <Card className="p-4 bg-primary border-none">
                            <div className="flex items-center justify-between mb-3">
                                <CardTitle className="text-lg font-bold text-black">Jupyter Lab</CardTitle>
                                <Badge className="bg-black/10 text-black text-[10px]">Interactive</Badge>
                            </div>
                            <CardDescription className="text-black/60 text-xs mb-3">
                                Launch an interactive notebook session
                            </CardDescription>

                            <div className="grid grid-cols-2 gap-2 mb-4">
                                <div>
                                    <Label className="text-[9px] font-bold text-black/50 uppercase">CPU Cores</Label>
                                    <Input 
                                        type="number"
                                        min={1}
                                        max={isAdmin ? 128 : quotas.cpu_limit}
                                        value={jupyterResources.total_cpu}
                                        onChange={(e) => setJupyterResources({...jupyterResources, total_cpu: parseInt(e.target.value) || 1})}
                                        className="h-8 bg-black/5 border-black/10 text-xs text-black font-bold focus:ring-black"
                                    />
                                </div>
                                <div>
                                    <Label className="text-[9px] font-bold text-black/50 uppercase">RAM (GB)</Label>
                                    <Input 
                                        type="number"
                                        min={1}
                                        max={isAdmin ? 512 : quotas.memory_limit_gb}
                                        value={jupyterResources.total_ram}
                                        onChange={(e) => setJupyterResources({...jupyterResources, total_ram: parseInt(e.target.value) || 1})}
                                        className="h-8 bg-black/5 border-black/10 text-xs text-black font-bold focus:ring-black"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <Label className="text-[9px] font-bold text-black/50 uppercase">Wall Time</Label>
                                    <Input 
                                        placeholder="HH:MM:SS"
                                        value={jupyterResources.walltime}
                                        onChange={(e) => setJupyterResources({...jupyterResources, walltime: e.target.value})}
                                        className="h-8 bg-black/5 border-black/10 text-xs text-black font-bold focus:ring-black font-mono"
                                    />
                                </div>
                            </div>

                            <Button 
                                onClick={handleLaunchJupyter}
                                disabled={submitting}
                                size="sm"
                                className="w-full bg-black text-white hover:bg-white/90 hover:text-black transition-all"
                            >
                                <Play className="h-3.5 w-3.5 mr-1.5" />
                                Launch
                            </Button>
                            
                            {!isAdmin && (
                                <div className="mt-2 text-[9px] font-bold text-black/40 uppercase tracking-tight text-center">
                                    Quota: {quotas.cpu_limit}C / {quotas.memory_limit_gb}G
                                </div>
                            )}
                        </Card>

                        <Card className="p-4 border-white/5 bg-white/[0.02] flex-1">
                            <CardHeader className="p-0 pb-3">
                                <CardTitle className="text-sm font-semibold text-gray-900">Submit Job</CardTitle>
                            </CardHeader>
                            <form onSubmit={handleSubmit} className="space-y-3">
                                <div>
                                    <Label className="text-[10px] font-medium text-muted-foreground uppercase">Job Name</Label>
                                    <Input 
                                        placeholder="job_name"
                                        className="h-8 bg-white/5 border-white/5 text-xs mt-1"
                                        value={formData.job_name}
                                        onChange={(e) => setFormData({...formData, job_name: e.target.value})}
                                        required
                                    />
                                </div>

                                <div ref={dropdownRef}>
                                    <Label className="text-[10px] font-medium text-muted-foreground uppercase">Script</Label>
                                    <div className="relative mt-1">
                                        <div 
                                            className={cn(
                                                "w-full bg-white/5 border border-white/5 rounded-md h-8 flex items-center justify-between px-3 cursor-pointer text-xs",
                                                openDropdown === 'script' ? "border-primary" : ""
                                            )}
                                            onClick={() => setOpenDropdown(openDropdown === 'script' ? null : 'script')}
                                        >
                                            <span className={formData.script_path ? "text-primary" : "text-muted-foreground"}>
                                                {formData.script_path ? formData.script_path.split('/').pop() : "Select script"}
                                            </span>
                                            <ChevronRight className={cn("h-3.5 w-3.5", openDropdown === 'script' ? "rotate-90" : "")} />
                                        </div>
                                        
                                        {openDropdown === 'script' && (
                                            <div className="absolute top-[calc(100%+4px)] left-0 w-full bg-[#0a0a0a] border border-white/10 rounded-md shadow-2xl z-50 max-h-48 overflow-y-auto py-1 ring-1 ring-black/50">
                                                {scripts.length === 0 ? (
                                                    <div className="px-3 py-2 text-[10px] text-muted-foreground italic">No executable scripts discovered</div>
                                                ) : scripts.map(s => (
                                                    <div 
                                                        key={s.path}
                                                        className="px-3 py-1.5 hover:bg-primary/20 text-white transition-colors cursor-pointer text-xs truncate"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setFormData({...formData, script_path: s.path});
                                                            setOpenDropdown(null);
                                                        }}
                                                    >
                                                        {s.name}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div ref={reqDropdownRef}>
                                    <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Requirements (.txt)</Label>
                                    <div className="relative mt-1">
                                        <div 
                                            className={cn(
                                                "w-full bg-white/5 border border-white/5 rounded-md h-8 flex items-center justify-between px-3 cursor-pointer text-xs transition-all",
                                                openDropdown === 'req' ? "border-primary/50 ring-1 ring-primary/20" : ""
                                            )}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setOpenDropdown(openDropdown === 'req' ? null : 'req');
                                            }}
                                        >
                                            <span className={formData.requirements_path ? "text-primary italic" : "text-muted-foreground font-mono opacity-50"}>
                                                {formData.requirements_path ? formData.requirements_path.split('/').pop() : "optional/config.txt"}
                                            </span>
                                            <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", openDropdown === 'req' ? "rotate-90" : "")} />
                                        </div>
                                        
                                        {openDropdown === 'req' && (
                                            <div className="absolute top-[calc(100%+4px)] left-0 w-full bg-[#0a0a0a] border border-white/10 rounded-md shadow-2xl z-50 max-h-48 overflow-y-auto py-1 ring-1 ring-black/50">
                                                <div 
                                                    className="px-3 py-1.5 hover:bg-white/10 text-rose-400 font-bold italic cursor-pointer text-[10px] uppercase tracking-tighter"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setFormData({...formData, requirements_path: ''});
                                                        setOpenDropdown(null);
                                                    }}
                                                >
                                                    -- Skip Dependency Injection --
                                                </div>
                                                {textFiles.length === 0 ? (
                                                    <div className="px-3 py-2 text-[10px] text-muted-foreground italic opacity-40">No configuration logs found</div>
                                                ) : textFiles.map(s => (
                                                    <div 
                                                        key={s.path}
                                                        className="px-3 py-1.5 hover:bg-primary/20 text-white transition-colors cursor-pointer text-xs truncate border-t border-white/5"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setFormData({...formData, requirements_path: s.path});
                                                            setOpenDropdown(null);
                                                        }}
                                                    >
                                                        {s.name}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <Label className="text-[10px] font-medium text-muted-foreground uppercase">CPU Cores</Label>
                                        <Input 
                                            type="number"
                                            min={1}
                                            className="h-8 bg-white/5 border-white/5 text-xs mt-1"
                                            value={formData.total_cpu}
                                            onChange={(e) => setFormData({...formData, total_cpu: parseInt(e.target.value) || 1})}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-[10px] font-medium text-muted-foreground uppercase">RAM (GB)</Label>
                                        <Input 
                                            type="number"
                                            min={1}
                                            className="h-8 bg-white/5 border-white/5 text-xs mt-1"
                                            value={formData.total_ram}
                                            onChange={(e) => setFormData({...formData, total_ram: parseInt(e.target.value) || 1})}
                                            required
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-[10px] font-medium text-muted-foreground uppercase">Wall Time (Duration)</Label>
                                    <Input 
                                        placeholder="HH:MM:SS"
                                        className="h-8 bg-white/5 border-white/5 text-xs mt-1 font-mono selection:bg-primary/40"
                                        value={formData.walltime}
                                        onChange={(e) => setFormData({...formData, walltime: e.target.value})}
                                        required
                                    />
                                    <p className="text-[9px] text-muted-foreground mt-1 opacity-50 font-mono">Format: HH:MM:SS (e.g., 04:30:00 for 4.5 hours)</p>
                                </div>
                                {!isAdmin && (
                                    <div className="text-[9px] font-medium text-muted-foreground/50 uppercase tracking-wider text-right px-1">
                                        Available: {Math.max(0, quotas.cpu_limit - quotas.cpu_used)}C / {Math.max(0, quotas.memory_limit_gb - quotas.ram_used)}G
                                    </div>
                                )}

                                <Button 
                                    type="submit"
                                    disabled={submitting}
                                    size="sm"
                                    className="w-full"
                                >
                                    {submitting ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        "Submit"
                                    )}
                                </Button>
                            </form>
                        </Card>
                    </div>
                )}

                <div className={cn(
                    "flex flex-col h-full overflow-hidden",
                    isAdmin ? "lg:col-span-12" : "lg:col-span-8"
                )}>
                    <JobList />
                </div>
            </div>

            {/* Monitoring Nexus Modal */}
            <AlertDialog open={!!monitoringJob} onOpenChange={(o) => !o && setMonitoringJob(null)}>
                <AlertDialogContent className="bg-[#020202] rounded-2xl border border-white/10 shadow-[0_100px_200px_rgba(0,0,0,1)] p-0 max-w-5xl h-[80vh] flex flex-col overflow-hidden">
                    <AlertDialogHeader className="p-4 border-b border-white/5 bg-[#0a0a0a]/80 shrink-0">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 bg-[#020202] rounded-xl flex items-center justify-center border border-white/5 relative">
                                    <Terminal className={cn("h-6 w-6 text-primary", isLive && "animate-pulse")} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 text-primary text-[10px] font-bold uppercase tracking-wider">
                                        <Signal className="h-3 w-3" />
                                        <span>{monitoringJob?.status}</span>
                                    </div>
                                    <AlertDialogTitle className="text-xl font-black text-white tracking-tight">{monitoringJob?.job_name}</AlertDialogTitle>
                                    <AlertDialogDescription className="text-[10px] text-white/30 font-mono tracking-tighter">
                                        ID: {monitoringJob?.slurm_job_id || 'LOCAL_IO'}
                                    </AlertDialogDescription>
                                </div>
                            </div>
                             <div className="flex items-center gap-3">
                                {monitoringJob?.script_path === "__jupyter__" && (
                                    <Button 
                                        onClick={() => {
                                            const match = liveLogs?.match(/http:\/\/\d+\.\d+\.\d+\.\d+:\d+\/lab/);
                                            if (match) {
                                                window.open(match[0], '_blank');
                                            } else {
                                                toast.error("Searching for active Jupyter socket... Signal not yet established.");
                                            }
                                        }}
                                        size="sm"
                                        className="h-8 bg-emerald-500 hover:bg-emerald-600 text-black text-[10px] font-bold uppercase tracking-widest px-4 border-none rounded-lg shadow-[0_0_15px_rgba(16,185,129,0.3)] animate-in slide-in-from-right-2"
                                    >
                                        <ArrowUpRight className="h-3.5 w-3.5 mr-1" />
                                        Go to Jupyter
                                    </Button>
                                )}
                                <Button 
                                    onClick={() => {
                                        if (!liveLogs) {
                                            toast.error("Telemetry buffer is currently empty.");
                                            return;
                                        }
                                        navigator.clipboard.writeText(liveLogs).then(() => {
                                            toast.success("Telemetry logs exported to clipboard.");
                                        }).catch(() => {
                                            const el = document.createElement('textarea');
                                            el.value = liveLogs;
                                            document.body.appendChild(el);
                                            el.select();
                                            document.execCommand('copy');
                                            document.body.removeChild(el);
                                            toast.success("Telemetry logs exported via fallback.");
                                        });
                                    }}
                                    size="sm"
                                    className="h-8 bg-white/5 hover:bg-primary text-white text-[10px] font-bold uppercase tracking-widest px-4 border border-white/5 rounded-lg"
                                >
                                    Copy Logs
                                </Button>
                                <Badge className={cn("px-3 py-1 rounded-lg text-[10px] font-bold uppercase", isLive ? "bg-emerald-500 text-black border-none" : "bg-white/5 text-white/40 border-white/10")}>
                                    {isLive ? 'Link Active' : 'Stable'}
                                </Badge>
                                <Button 
                                    onClick={() => setMonitoringJob(null)}
                                    size="icon"
                                    className="h-8 w-8 bg-white text-black hover:bg-rose-500 hover:text-white rounded-lg transition-all"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </AlertDialogHeader>

                    <div className="flex-1 overflow-hidden bg-[#020202]">
                        <div className="h-full overflow-y-auto p-0 font-mono text-[11px] selection:bg-primary/40 leading-relaxed bg-[#020202]">
                            {liveLogs ? (
                                <div className="p-4 flex flex-col gap-1 min-h-full select-text cursor-text">
                                    <div className="flex items-center gap-2 text-white/20 text-[9px] font-bold uppercase tracking-[0.2em] mb-4 border-b border-white/5 pb-2">
                                        <Terminal className="h-3 w-3" />
                                        <span>Workload Telemetry Nexus v4.0.0-PROD</span>
                                    </div>
                                    {liveLogs.split('\n').map((line, i) => {
                                        const isError = line.toLowerCase().includes('error') || line.toLowerCase().includes('fail') || line.toLowerCase().includes('exception');
                                        return (
                                            <div key={i} className="flex gap-4 group hover:bg-white/[0.04] transition-colors -mx-4 px-4 py-0.5 select-text cursor-text relative">
                                                <span className="text-white/10 select-none text-right w-8 font-mono border-r border-white/5 pr-3">{i + 1}</span>
                                                <span className={cn(
                                                    "flex-1 break-all whitespace-pre-wrap font-medium select-text",
                                                    isError ? "text-rose-500 font-bold" : "text-white"
                                                )}>
                                                    {line || <br />}
                                                </span>
                                            </div>
                                        );
                                    })}
                                    <div className="flex gap-4 mt-2 -mx-4 px-4 py-1 bg-primary/5">
                                        <span className="text-white/10 selection-none text-right w-8 pr-3">::</span>
                                        <div className="flex items-center gap-2 text-primary animate-pulse font-bold text-[10px]">
                                            <Signal className="h-3 w-3" />
                                            <span>Stream Synchronized</span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3 opacity-30 p-10 py-20 items-center justify-center text-center">
                                  <Loader2 className="h-8 w-8 text-emerald-500 animate-spin mb-4" />
                                  <div className="space-y-2 w-full max-w-sm">
                                      <div className="h-1 bg-emerald-500/20 rounded-full w-full overflow-hidden">
                                          <div className="h-full bg-emerald-500/40 w-1/3 animate-[shimmer_2s_infinite]" />
                                      </div>
                                      <div className="h-1 bg-emerald-500/10 rounded-full w-2/3 mx-auto" />
                                  </div>
                                  <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mt-6 animate-pulse">Establishing Signal...</div>
                                </div>
                            )}
                        </div>
                    </div>
                </AlertDialogContent>
            </AlertDialog>

            {/* Stop Job Confirmation */}
            <AlertDialog open={!!jobToStop} onOpenChange={(o) => !o && setJobToStop(null)}>
                <AlertDialogContent className="!bg-white !text-black border-none shadow-2xl rounded-[2rem] p-8 max-w-sm">
                    <AlertDialogHeader className="items-center text-center">
                        <div className="h-16 w-16 bg-amber-50 rounded-2xl flex items-center justify-center mb-4">
                            <Power className="h-8 w-8 text-amber-500" />
                        </div>
                        <AlertDialogTitle className="text-xl font-black text-gray-900">Stop Job?</AlertDialogTitle>
                        <AlertDialogDescription className="text-gray-500 text-xs mt-2 px-2">
                           This will stop <span className="font-black text-amber-600">{jobToStop?.job_name}</span> immediately.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex flex-col sm:flex-col gap-2 mt-6">
                        <AlertDialogCancel className="rounded-xl font-bold h-10 border-gray-100">Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={confirmStopJob} 
                            className="rounded-xl h-12 shadow-lg shadow-amber-200 font-bold bg-amber-500 hover:bg-amber-600 border-none text-black"
                        >
                            Stop Job
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={!!jobToDelete} onOpenChange={(o) => !o && setJobToDelete(null)}>
                <AlertDialogContent className="!bg-white !text-black border-none shadow-2xl rounded-[2rem] p-8 max-w-sm">
                    <AlertDialogHeader className="items-center text-center">
                        <div className="h-16 w-16 bg-rose-50 rounded-2xl flex items-center justify-center mb-4">
                            <Trash2 className="h-8 w-8 text-rose-500" />
                        </div>
                        <AlertDialogTitle className="text-xl font-black text-gray-900">Delete Job?</AlertDialogTitle>
                        <AlertDialogDescription className="text-gray-500 text-xs mt-2 px-2">
                            This will remove <span className="font-black text-rose-600">"{jobToDelete?.job_name}"</span> from the list permanently.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex flex-col sm:flex-col gap-2 mt-6">
                        <AlertDialogCancel className="rounded-xl font-bold h-10 border-gray-100">Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={confirmDeleteJob} 
                            className="rounded-xl h-12 shadow-lg shadow-rose-200 font-bold bg-rose-500 hover:bg-rose-600 border-none"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
