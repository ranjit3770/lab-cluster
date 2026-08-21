import React, { useEffect, useState, useRef } from 'react';
import { jobsApi } from '@/api/jobs';
import { filesApi } from '@/api/files';
import { useAuth } from '@/context/AuthContext';
import PageLoader from '@/components/PageLoader';
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
    X,
    Send,
    ExternalLink
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
    updated_at?: string;
    total_cpu?: number;
    total_ram?: number;
    walltime?: string;
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
        total_cpu: '1',
        total_ram: '1',
        walltime: '01:00:00',
        gpu_count: '0',
        job_type: 'distributed'
    });



    const [jupyterResources, setJupyterResources] = useState({
        total_cpu: '1',
        total_ram: '1',
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
    const [infoJob, setInfoJob] = useState<Job | null>(null);
    const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
    
    const [elapsedTimes, setElapsedTimes] = useState<Record<number, string>>({});
    
    const [selectedApp, setSelectedApp] = useState<'jupyter' | 'python' | null>(null);
    const [isAppSelectorOpen, setIsAppSelectorOpen] = useState(false);
    const [scriptsLoading, setScriptsLoading] = useState(false);

    // Custom Dropdown States
    const [openDropdown, setOpenDropdown] = useState<'script' | 'req' | 'dep' | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const reqDropdownRef = useRef<HTMLDivElement>(null);

    const normalizeIntInput = (value: string | number, min = 1) => {
        const parsed = parseInt(String(value), 10);
        if (!Number.isFinite(parsed) || parsed < min) return String(min);
        return String(parsed);
    };

    const toPositiveInt = (value: string | number, min = 1) => {
        return parseInt(normalizeIntInput(value, min), 10);
    };

    const walltimeToSeconds = (value: string) => {
        const parts = value.split(':').map((part) => parseInt(part, 10));
        if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return 0;
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    };

    const secondsToWalltime = (seconds: number) => {
        const safeSeconds = Math.max(60, Math.floor(seconds));
        const hours = Math.floor(safeSeconds / 3600);
        const minutes = Math.floor((safeSeconds % 3600) / 60);
        const secs = safeSeconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    const normalizeWalltime = (value: string, minSeconds: number) => {
        const timeRegex = /^([0-9]{2}):([0-9]{2}):([0-9]{2})$/;
        if (!timeRegex.test(value)) return secondsToWalltime(minSeconds);
        return secondsToWalltime(Math.max(walltimeToSeconds(value), minSeconds));
    };

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

    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [ownerFilter, setOwnerFilter] = useState<string>('ALL');
    const [selectedJobIds, setSelectedJobIds] = useState<(number | string)[]>([]);

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
        setScriptsLoading(true);
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
            setScriptsLoading(false);
        } catch (err) {
            setScriptsLoading(false);
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

        const interval = setInterval(() => {
            fetchJobs(true);
        }, 15000);

        return () => clearInterval(interval);
    }, [token]);

    useEffect(() => {
        if (selectedApp === 'python') {
            fetchScripts();
            if (!isAdmin) fetchQuotas();
        }
    }, [selectedApp]);

    // Timer effect for Running Jobs
    useEffect(() => {
        const interval = setInterval(() => {
            const newTimes: Record<number, string> = {};
            jobs.forEach(j => {
                if (j.status === 'RUNNING' && j.updated_at) {
                    const diff = Math.max(0, Math.floor((new Date().getTime() - new Date(j.updated_at + "Z").getTime()) / 1000));
                    const h = String(Math.floor(diff / 3600)).padStart(2, '0');
                    const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
                    const s = String(diff % 60).padStart(2, '0');
                    newTimes[j.id] = `${h}:${m}:${s}`;
                }
            });
            setElapsedTimes(newTimes);
        }, 1000);
        return () => clearInterval(interval);
    }, [jobs]);

    const stats = {
        pending: jobs.filter(j => j.status === 'PENDING').length,
        running: jobs.filter(j => j.status === 'RUNNING').length,
        completed: jobs.filter(j => j.status === 'COMPLETED').length,
        failed: jobs.filter(j => j.status === 'FAILED').length,
        cancelled: jobs.filter(j => j.status === 'CANCELLED').length
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.job_name || !formData.script_path) {
            toast.error("Please provide both a job name and a script context.");
            return;
        }

        const nameExists = jobs.some(j => 
            j.job_name.toLowerCase() === formData.job_name.toLowerCase() && 
            ['PENDING', 'RUNNING'].includes(j.status)
        );

        if (nameExists) {
            toast.error(`"${formData.job_name}" is currently active. Use a unique designation to avoid telemetry collisions.`);
            return;
        }

        // Wall Time Validation
        const timeRegex = /^([0-9]{2}):([0-9]{2}):([0-9]{2})$/;
        const normalizedBatchWalltime = normalizeWalltime(formData.walltime, 60);
        if (!timeRegex.test(formData.walltime)) {
            toast.error("Invalid Wall Time format. Please use HH:MM:SS (e.g., 01:00:00).");
            return;
        }

        // Resource Validation
        try {
            setSubmitting(true);
            await jobsApi.submitJob(token!, {
                ...formData,
                total_cpu: toPositiveInt(formData.total_cpu, 1),
                total_ram: toPositiveInt(formData.total_ram, 1),
                gpu_count: toPositiveInt(formData.gpu_count, 0),
                walltime: normalizedBatchWalltime,
                job_type: formData.job_type || 'distributed'
            });
            
            toast.success("Job submitted successfully.");
            setFormData({ 
                job_name: '', 
                script_path: '', 
                requirements_path: '', 
                dependency_path: '',
                total_cpu: '1',
                total_ram: '1',
                walltime: '01:00:00',
                gpu_count: '0',
                job_type: 'distributed'
            });
            fetchJobs(true);
        } catch (err: any) {
            toast.error(err.response?.data?.detail || "Job submission failed.");
        } finally {
            setSubmitting(false);
        }
    };

    const filteredJobs = jobs.filter(j => {
        const matchesSearch = j.job_name.toLowerCase().includes(search.toLowerCase()) ||
                             (j.script_path && j.script_path.toLowerCase().includes(search.toLowerCase())) ||
                             j.id.toString().includes(search);
        
        const matchesStatus = statusFilter === 'ALL' || j.status === statusFilter;
        const matchesOwner = ownerFilter === 'ALL' || j.owner?.username === ownerFilter;
        
        return matchesSearch && matchesStatus && matchesOwner;
    });

    const confirmBulkDelete = async () => {
        if (selectedJobIds.length === 0) return;
        try {
            await jobsApi.bulkDeleteJobs(token!, selectedJobIds);
            toast.success(`Purged ${selectedJobIds.length} job records.`);
            setSelectedJobIds([]);
            setShowBulkDeleteModal(false);
            fetchJobs(true);
        } catch (err: any) {
            toast.error("Bulk cleanup encountered resistance: " + (err.response?.data?.detail || err.message));
        }
    };

    const toggleJobSelection = (jid: number | string) => {
        const job = jobs.find(j => j.id === jid);
        if (job?.status === 'RUNNING') {
             toast.error("Running jobs cannot be deleted in bulk. Stop them first.");
             return;
        }
        setSelectedJobIds(prev => 
            prev.includes(jid) ? prev.filter(id => id !== jid) : [...prev, jid]
        );
    };

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
            toast.success("Job stop signal sent.");
            setJobToStop(null);
            fetchJobs(true);
        } catch (err: any) {
            toast.error("Stop failed: " + (err.response?.data?.detail || err.message));
        }
    };

    const handleOpenJupyter = async (job: Job) => {
        try {
            const res = await jobsApi.getJupyterUrl(token!, job.id);
            const data = res.data;
            
            if (data.status === 'RUNNING' && data.url) {
                window.open(data.url, '_blank');
            } else if (data.status === 'PENDING') {
                toast.info(data.message || 'Jupyter is still starting. Please wait and try again.');
            } else {
                toast.warning('Jupyter URL not available yet. The job may still be initializing.');
            }
        } catch (err: any) {
            // Fallback: try to extract URL from output_log
            if (job.output_log) {
                const portMatch = job.output_log.match(/Jupyter port: (\d+)/);
                const tokenMatch = job.output_log.match(/Access token: ([a-f0-9]+)/);
                if (portMatch) {
                    const port = portMatch[1];
                    const token = tokenMatch ? tokenMatch[1] : '';
                    const host = window.location.hostname;
                    const url = token ? `http://${host}:${port}/lab?token=${token}` : `http://${host}:${port}/lab`;
                    window.open(url, '_blank');
                    return;
                }
            }
            toast.error('Could not resolve Jupyter URL. Check job logs for access details.');
        }
    };

    const handleLaunchJupyter = async () => {
        try {
            const timeRegex = /^([0-9]{2}):([0-9]{2}):([0-9]{2})$/;
            if (!timeRegex.test(jupyterResources.walltime)) {
                toast.error("Invalid time format. Use HH:MM:SS (e.g., 04:00:00).");
                return;
            }

            // Advisory warnings only — never block submission
            const requestedCpu = toPositiveInt(jupyterResources.total_cpu, 1);
            const requestedRam = toPositiveInt(jupyterResources.total_ram, 1);
            const normalizedJupyterWalltime = normalizeWalltime(jupyterResources.walltime, 1800);
            if (normalizedJupyterWalltime !== jupyterResources.walltime) {
                setJupyterResources(prev => ({...prev, walltime: normalizedJupyterWalltime}));
                toast.info(`Jupyter wall time adjusted to ${normalizedJupyterWalltime} for a stable interactive session.`);
            }
            if (!isAdmin && requestedCpu > quotas.cpu_limit) {
                toast.warning(`CPU request (${jupyterResources.total_cpu}) exceeds your quota (${quotas.cpu_limit}). Job will queue until resources are available.`);
            }
            if (!isAdmin && requestedRam > quotas.memory_limit_gb) {
                toast.warning(`RAM request (${jupyterResources.total_ram}GB) exceeds your quota (${quotas.memory_limit_gb}GB). Job will queue until resources are available.`);
            }

            const jupyterData = {
                job_name: `Jupyter_${new Date().getTime().toString().slice(-4)}`,
                script_path: '__jupyter__',
                requirements_path: '',
                dependency_path: '',
                total_cpu: requestedCpu,
                total_ram: requestedRam,
                walltime: normalizedJupyterWalltime,
                job_type: 'jupyter'
            };
            await jobsApi.submitJob(token!, jupyterData);
            toast.success("Jupyter session submitted. It will start when resources are available.");
            setTimeout(() => fetchJobs(true), 500);
        } catch (err: any) {
            toast.error(err.response?.data?.detail || "Jupyter launch failed.");
        } finally {
            setSubmitting(false);
        }
    };

    const streamAbortController = useRef<AbortController | null>(null);

    const startStream = () => {
        if (!monitoringJob) return;
        if (streamAbortController.current) {
            streamAbortController.current.abort();
        }
        const controller = new AbortController();
        streamAbortController.current = controller;

        setIsLive(true);
        setLiveLogs(''); 
        const jobApiUrl = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`;

        const performPoll = async () => {
            if (controller.signal.aborted) return;
            try {
                const response = await fetch(`${jobApiUrl}/api/v1/jobs/${monitoringJob.id}/logs`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                    signal: controller.signal
                });
                if (!response.ok) throw new Error("Connection failed");
                const text = await response.text();
                
                if (controller.signal.aborted) return;
                setLiveLogs(text);
                
                if (!controller.signal.aborted) {
                    setTimeout(performPoll, 3000);
                }
            } catch (err: any) {
                if (err.name !== 'AbortError') {
                    console.error("Slurm Poll Error:", err);
                    setLiveLogs(prev => prev || monitoringJob?.output_log || monitoringJob?.error_log || '');
                    
                    if (!controller.signal.aborted) {
                        setTimeout(performPoll, 5000);
                    }
                }
            }
        };
        
        performPoll();
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

    if (loading && jobs.length === 0) return <PageLoader message="Loading jobs..." />;

    const infoStatus = infoJob?.status?.toUpperCase() || '';
    const infoTrace = infoJob
        ? [
            infoStatus === 'FAILED' ? infoJob.error_log : undefined,
            infoJob.output_log,
            infoStatus !== 'FAILED' ? infoJob.error_log : undefined,
        ].filter(Boolean).join('\n\n')
        : '';

    const JobList = ({ showHeader = true }) => (
        <div className="flex flex-col h-full gap-3">
            {showHeader && (
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-semibold text-gray-900">Jobs</h2>
                        <p className="text-xs text-muted-foreground">{filteredJobs.length} total</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {!isAdmin && selectedJobIds.length > 0 && (
                            <Button 
                                onClick={() => setShowBulkDeleteModal(true)}
                                size="sm"
                                variant="destructive"
                                className="h-8 text-[10px] font-bold uppercase px-3 shadow-lg shadow-rose-900/20"
                            >
                                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                                Delete ({selectedJobIds.length})
                            </Button>
                        )}
                        <Button 
                             onClick={() => fetchJobs()}
                             size="sm"
                             variant="outline"
                             className={cn("h-8 w-8 p-0", refreshing && "animate-spin")}
                        >
                            <RefreshCcw className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            )}
            
            <Card className="overflow-hidden border-white/5 bg-white/[0.02] flex-1">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-white/5">
                                <th className="px-3 py-2.5 w-10">
                                    {!isAdmin && (
                                        <input 
                                            type="checkbox" 
                                            className="h-3.5 w-3.5 accent-primary bg-black border-white/10 rounded cursor-pointer"
                                            checked={selectedJobIds.length > 0 && selectedJobIds.length === filteredJobs.filter(j => j.status !== 'RUNNING').length}
                                            onChange={() => {
                                                const selectable = filteredJobs.filter(j => j.status !== 'RUNNING');
                                                if (selectable.length === 0) return;
                                                if (selectedJobIds.length === selectable.length) setSelectedJobIds([]);
                                                else setSelectedJobIds(selectable.map(j => j.id));
                                            }}
                                        />
                                    )}
                                </th>
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
                                    <tr key={j.id} className={cn("hover:bg-white/[0.02] transition-colors", selectedJobIds.includes(j.id) && "bg-primary/[0.03]")}>
                                        <td className="px-3 py-2.5">
                                            {!isAdmin && (
                                                <input 
                                                    type="checkbox"
                                                    disabled={j.status === 'RUNNING'}
                                                    className={cn("h-3.5 w-3.5 accent-primary bg-black border-white/10 rounded cursor-pointer", j.status === 'RUNNING' && "opacity-50 cursor-not-allowed")}
                                                    checked={selectedJobIds.includes(j.id)}
                                                    onChange={() => toggleJobSelection(j.id)}
                                                />
                                            )}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <div className="flex items-center gap-2.5">
                                                <div className="h-8 w-8 flex items-center justify-center bg-white/5 rounded-md">
                                                    <Terminal className={cn("h-4 w-4", j.status === 'RUNNING' ? "text-primary animate-pulse" : "text-muted-foreground")} />
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
                                                j.status === 'RUNNING' ? "bg-primary/10 text-primary" :
                                                j.status === 'PENDING' ? "bg-amber-500/10 text-amber-500" :
                                                j.status === 'WAITING' ? "bg-indigo-500/10 text-indigo-500" :
                                                j.status === 'COMPLETED' ? "bg-emerald-500/10 text-emerald-500" :
                                                j.status === 'FAILED' ? "bg-rose-500/10 text-rose-500" : 
                                                j.status === 'CANCELLED' ? "bg-white/5 text-muted-foreground" : "bg-white/5 text-muted-foreground"
                                            )}>
                                                {j.status === 'PENDING' ? 'Queued / starting' :
                                                 j.status === 'WAITING' ? 'Waiting for quota' :
                                                 j.status}
                                            </span>
                                        </td>
                                        {isAdmin && (
                                            <td className="px-3 py-2.5">
                                                <span className="text-xs text-muted-foreground truncate max-w-[150px] block">{j.script_path?.split('/').pop() || '-'}</span>
                                            </td>
                                        )}
                                        <td className="px-3 py-2.5 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                {/* Open Jupyter button — only for running Jupyter jobs */}
                                                {j.script_path === '__jupyter__' && j.status === 'RUNNING' && (
                                                    <Button
                                                        onClick={() => handleOpenJupyter(j)}
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                                                        title="Open Jupyter"
                                                    >
                                                        <ExternalLink className="h-3.5 w-3.5" />
                                                    </Button>
                                                )}
                                                <Button 
                                                    onClick={() => setInfoJob(j)}
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 text-sky-500 hover:text-sky-400 hover:bg-sky-500/10"
                                                    title="View Info"
                                                >
                                                    <Info className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button 
                                                    onClick={() => setMonitoringJob(j)}
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7"
                                                >
                                                    <Monitor className="h-3.5 w-3.5" />
                                                </Button>
                                                
                                                {['RUNNING', 'PENDING'].includes(j.status) ? (
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
                <div className="flex items-center gap-3">
                    {isAdmin && (
                        <div className="flex items-center gap-2">
                             <select 
                                className="h-8 bg-white/5 border border-white/5 rounded-md text-[10px] px-2 text-white outline-none focus:border-primary/50 font-bold uppercase"
                                value={ownerFilter}
                                onChange={(e) => setOwnerFilter(e.target.value)}
                            >
                                <option value="ALL">All Owners</option>
                                {Array.from(new Set(jobs.map(j => j.owner?.username).filter(Boolean))).map(u => (
                                    <option key={u} value={u!}>{u}</option>
                                ))}
                            </select>
                            <select 
                                className="h-8 bg-white/5 border border-white/5 rounded-md text-[10px] px-2 text-white outline-none focus:border-primary/50 font-bold uppercase"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                            >
                                <option value="ALL">All Status</option>
                                <option value="RUNNING">Running</option>
                                <option value="PENDING">Queued</option>
                                <option value="COMPLETED">Completed</option>
                                <option value="FAILED">Failed</option>
                                <option value="WAITING">Waiting (Local)</option>
                            </select>
                        </div>
                    )}
                    {!isAdmin && (
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
                </div>
                )}
            </header>

            {isAdmin && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {[
                        { label: 'Running', count: stats.running, color: 'text-primary', bg: 'bg-primary/10' },
                        { label: 'Queued', count: stats.pending, color: 'text-amber-500', bg: 'bg-amber-500/10' },
                        { label: 'Completed', count: stats.completed, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                        { label: 'Failed', count: stats.failed, color: 'text-rose-500', bg: 'bg-rose-500/10' },
                        { label: 'Cancelled', count: stats.cancelled, color: 'text-muted-foreground', bg: 'bg-white/5' },
                    ].map((s) => (
                        <Card key={s.label} className={cn("p-3 border-white/5", s.bg)}>
                            <div className={cn("text-xs font-bold uppercase", s.color)}>{s.label}</div>
                            <div className="text-2xl font-black mt-1 text-gray-900">{s.count}</div>
                        </Card>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                {!isAdmin && (
                    <div className="lg:col-span-4 flex flex-col h-full gap-3">
                        <Button 
                            onClick={() => setIsAppSelectorOpen(true)}
                            className="w-full h-14 bg-primary/10 hover:bg-primary/20 text-primary font-bold uppercase tracking-widest transition-all shadow-lg shadow-primary/10 rounded-2xl flex items-center justify-center gap-3 border border-primary/20"
                        >
                            <Sparkles className="h-5 w-5" />
                            Integrated Apps
                        </Button>

                        {!selectedApp && (
                            <Card className="p-8 border-dashed border-white/10 bg-transparent flex-1 flex flex-col items-center justify-center text-center text-muted-foreground mt-2">
                                <Layers className="h-8 w-8 mb-3 opacity-20" />
                                <p className="text-[10px] font-medium uppercase tracking-widest opacity-50">Select an App</p>
                            </Card>
                        )}

                        {selectedApp === 'jupyter' && (
                        <Card className="p-4 bg-primary border-none">
                            <div className="flex items-center justify-between mb-3">
                                <CardTitle className="text-lg font-bold text-black flex items-center gap-2">
                                    <Orbit className="h-5 w-5" />
                                    Jupyter Lab
                                </CardTitle>
                                <Badge className="bg-black/10 text-black text-[10px]">Interactive</Badge>
                            </div>
                            <CardDescription className="text-black/60 text-xs mb-3">
                                Launch an interactive notebook session
                            </CardDescription>

                            <div className="grid grid-cols-2 gap-2 mb-4">
                                <div>
                                    <Label className="text-[9px] font-bold text-black/50 uppercase">CPU Cores</Label>
                                    <Input 
                                        type="text"
                                        inputMode="numeric"
                                        min={1}
                                        max={isAdmin ? 128 : quotas.cpu_limit}
                                        value={jupyterResources.total_cpu}
                                        onChange={(e) => setJupyterResources({...jupyterResources, total_cpu: e.target.value.replace(/[^\d]/g, '')})}
                                        onBlur={(e) => setJupyterResources({...jupyterResources, total_cpu: normalizeIntInput(e.target.value, 1)})}
                                        className="h-9 sm:h-8 min-w-0 rounded-lg bg-black/5 border-black/10 text-xs text-black font-bold focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:border-black/30"
                                    />
                                </div>
                                <div>
                                    <Label className="text-[9px] font-bold text-black/50 uppercase">RAM (GB)</Label>
                                    <Input 
                                        type="text"
                                        inputMode="numeric"
                                        min={1}
                                        max={isAdmin ? 512 : quotas.memory_limit_gb}
                                        value={jupyterResources.total_ram}
                                        onChange={(e) => setJupyterResources({...jupyterResources, total_ram: e.target.value.replace(/[^\d]/g, '')})}
                                        onBlur={(e) => setJupyterResources({...jupyterResources, total_ram: normalizeIntInput(e.target.value, 1)})}
                                        className="h-9 sm:h-8 min-w-0 rounded-lg bg-black/5 border-black/10 text-xs text-black font-bold focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:border-black/30"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <Label className="text-[9px] font-bold text-black/50 uppercase">Wall Time</Label>
                                    <Input 
                                        placeholder="HH:MM:SS"
                                        value={jupyterResources.walltime}
                                        onChange={(e) => setJupyterResources({...jupyterResources, walltime: e.target.value})}
                                        onBlur={(e) => setJupyterResources({...jupyterResources, walltime: normalizeWalltime(e.target.value, 1800)})}
                                        className="h-9 sm:h-8 min-w-0 rounded-lg bg-black/5 border-black/10 text-xs text-black font-bold focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:border-black/30 font-mono"
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
                        )}

                        {selectedApp === 'python' && scriptsLoading ? (
                        <Card className="p-4 border border-gray-100 bg-white flex-1 shadow-sm">
                            <div className="flex flex-col items-center justify-center py-8 gap-3">
                                <Loader2 className="h-6 w-6 text-primary animate-spin" />
                                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Loading environment...</p>
                            </div>
                        </Card>
                        ) : selectedApp === 'python' && (
                        <Card className="p-4 border border-gray-100 bg-white flex-1 shadow-sm">
                            <CardHeader className="p-0 pb-3 flex flex-row items-center justify-between">
                                <CardTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                                    <Terminal className="h-4 w-4 text-emerald-500" />
                                    Python App
                                </CardTitle>
                                <Badge className="bg-emerald-500/10 text-emerald-500 border-none text-[10px]">Batch</Badge>
                            </CardHeader>
                            <form onSubmit={handleSubmit} className="space-y-3">
                                <div>
                                    <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Job Name</Label>
                                    <Input 
                                        placeholder="Example: training_run_01"
                                        className="h-10 sm:h-9 min-w-0 rounded-lg bg-gray-50 border-gray-200 text-xs text-gray-900 mt-1 transition-colors placeholder:text-gray-400 focus-visible:bg-white focus-visible:border-primary/60 focus-visible:ring-primary/20"
                                        value={formData.job_name}
                                        onChange={(e) => setFormData({...formData, job_name: e.target.value})}
                                        required
                                    />
                                </div>

                                <div ref={dropdownRef}>
                                    <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Script</Label>
                                    <div className="relative mt-1">
                                        <div 
                                            className={cn(
                                                "w-full min-w-0 bg-gray-50 border border-gray-200 rounded-lg h-10 sm:h-9 flex items-center justify-between gap-2 px-3 cursor-pointer text-xs text-gray-900 transition-colors hover:bg-white hover:border-gray-300",
                                                openDropdown === 'script' ? "border-primary/60 ring-2 ring-primary/10 bg-white" : ""
                                            )}
                                            onClick={() => setOpenDropdown(openDropdown === 'script' ? null : 'script')}
                                        >
                                            <span className={cn("min-w-0 truncate font-medium", formData.script_path ? "text-gray-900" : "text-gray-400")}>
                                                {formData.script_path ? formData.script_path.split('/').pop() : "Select script"}
                                            </span>
                                            <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform", openDropdown === 'script' ? "rotate-90 text-primary" : "")} />
                                        </div>
                                        
                                        {openDropdown === 'script' && (
                                            <div className="absolute top-[calc(100%+4px)] left-0 w-full bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto py-1 ring-1 ring-black/5">
                                                {scripts.length === 0 ? (
                                                    <div className="px-3 py-2 text-[10px] text-gray-400 italic">No executable scripts discovered</div>
                                                ) : scripts.map(s => (
                                                    <div 
                                                        key={s.path}
                                                        className="px-3 py-2 hover:bg-primary/10 text-gray-900 transition-colors cursor-pointer text-xs truncate"
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
                                    <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Requirements (.txt)</Label>
                                    <div className="relative mt-1">
                                        <div 
                                            className={cn(
                                                "w-full min-w-0 bg-gray-50 border border-gray-200 rounded-lg h-10 sm:h-9 flex items-center justify-between gap-2 px-3 cursor-pointer text-xs transition-all hover:bg-white hover:border-gray-300",
                                                openDropdown === 'req' ? "border-primary/60 ring-2 ring-primary/10 bg-white" : ""
                                            )}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setOpenDropdown(openDropdown === 'req' ? null : 'req');
                                            }}
                                        >
                                            <span className={cn("min-w-0 truncate font-medium", formData.requirements_path ? "text-gray-900" : "text-gray-400")}>
                                                {formData.requirements_path ? formData.requirements_path.split('/').pop() : "Optional requirements.txt"}
                                            </span>
                                            <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-200", openDropdown === 'req' ? "rotate-90 text-primary" : "")} />
                                        </div>
                                        
                                        {openDropdown === 'req' && (
                                            <div className="absolute top-[calc(100%+4px)] left-0 w-full bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto py-1 ring-1 ring-black/5">
                                                <div 
                                                    className="px-3 py-2 hover:bg-rose-50 text-rose-500 font-bold cursor-pointer text-[10px] uppercase tracking-wide"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setFormData({...formData, requirements_path: ''});
                                                        setOpenDropdown(null);
                                                    }}
                                                >
                                                    -- Skip Dependency Injection --
                                                </div>
                                                {textFiles.length === 0 ? (
                                                    <div className="px-3 py-2 text-[10px] text-gray-400 italic">No requirements files found</div>
                                                ) : textFiles.map(s => (
                                                    <div 
                                                        key={s.path}
                                                        className="px-3 py-2 hover:bg-primary/10 text-gray-900 transition-colors cursor-pointer text-xs truncate border-t border-gray-100"
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
                                        <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">CPU Cores</Label>
                                        <Input 
                                            type="text"
                                            min={1}
                                            inputMode="numeric"
                                            className="h-10 sm:h-9 min-w-0 rounded-lg bg-gray-50 border-gray-200 text-xs text-gray-900 mt-1 transition-colors focus-visible:bg-white focus-visible:border-primary/60 focus-visible:ring-primary/20"
                                            value={formData.total_cpu}
                                            onChange={(e) => setFormData({...formData, total_cpu: e.target.value.replace(/[^\d]/g, '')})}
                                            onBlur={(e) => setFormData({...formData, total_cpu: normalizeIntInput(e.target.value, 1)})}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">RAM (GB)</Label>
                                        <Input 
                                            type="text"
                                            min={1}
                                            inputMode="numeric"
                                            className="h-10 sm:h-9 min-w-0 rounded-lg bg-gray-50 border-gray-200 text-xs text-gray-900 mt-1 transition-colors focus-visible:bg-white focus-visible:border-primary/60 focus-visible:ring-primary/20"
                                            value={formData.total_ram}
                                            onChange={(e) => setFormData({...formData, total_ram: e.target.value.replace(/[^\d]/g, '')})}
                                            onBlur={(e) => setFormData({...formData, total_ram: normalizeIntInput(e.target.value, 1)})}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Wall Time</Label>
                                        <Input 
                                            placeholder="HH:MM:SS"
                                            pattern="[0-9]{2}:[0-9]{2}:[0-9]{2}"
                                            className="h-10 sm:h-9 min-w-0 rounded-lg bg-gray-50 border-gray-200 text-xs text-gray-900 mt-1 font-mono transition-colors focus-visible:bg-white focus-visible:border-primary/60 focus-visible:ring-primary/20"
                                            value={formData.walltime}
                                            onChange={(e) => setFormData({...formData, walltime: e.target.value})}
                                            onBlur={(e) => setFormData({...formData, walltime: normalizeWalltime(e.target.value, 60)})}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">GPU (Optional)</Label>
                                        <Input 
                                            type="text"
                                            min={0}
                                            inputMode="numeric"
                                            className="h-10 sm:h-9 min-w-0 rounded-lg bg-gray-50 border-gray-200 text-xs text-gray-900 mt-1 transition-colors focus-visible:bg-white focus-visible:border-primary/60 focus-visible:ring-primary/20"
                                            value={formData.gpu_count}
                                            onChange={(e) => setFormData({...formData, gpu_count: e.target.value.replace(/[^\d]/g, '')})}
                                            onBlur={(e) => setFormData({...formData, gpu_count: normalizeIntInput(e.target.value, 0)})}
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Job Type</Label>
                                        <select 
                                            className="w-full h-10 sm:h-9 min-w-0 bg-gray-50 border border-gray-200 rounded-lg text-xs px-3 text-gray-900 outline-none transition-colors focus:bg-white focus:border-primary/60 focus:ring-2 focus:ring-primary/20 mt-1"
                                            value={formData.job_type}
                                            onChange={(e) => setFormData({...formData, job_type: e.target.value})}
                                        >
                                            <option value="distributed">Smart Distributed</option>
                                            <option value="single_node">Single Node</option>
                                            <option value="multithread">Multi-threaded</option>
                                            <option value="mpi">MPI (Distributed)</option>
                                            <option value="gpu">GPU Compute</option>
                                        </select>
                                    </div>
                                </div>

                                <Button 
                                    type="submit"
                                    disabled={submitting}
                                    className="w-full h-10 bg-black text-white hover:bg-white/90 hover:text-black font-bold transition-all mt-4 rounded-xl shadow-xl shadow-black/50"
                                >
                                    <Send className="h-4 w-4 mr-2" />
                                    {submitting ? 'Submitting...' : 'Submit Job'}
                                </Button>

                                {!isAdmin && (
                                    <div className="text-[9px] font-medium text-muted-foreground/50 uppercase tracking-wider text-right px-1">
                                        Available: {Math.max(0, quotas.cpu_limit - quotas.cpu_used)}C / {Math.max(0, quotas.memory_limit_gb - quotas.ram_used)}G
                                    </div>
                                )}
                            </form>
                        </Card>
                        )}
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
                                {monitoringJob?.script_path === "__jupyter__" && monitoringJob?.status === 'RUNNING' && (
                                    <Button 
                                        onClick={() => handleOpenJupyter(monitoringJob)}
                                        size="sm"
                                        className="h-8 bg-emerald-500 hover:bg-emerald-600 text-black text-[10px] font-bold uppercase tracking-widest px-4 border-none rounded-lg shadow-[0_0_15px_rgba(16,185,129,0.3)] animate-in slide-in-from-right-2"
                                    >
                                        <ArrowUpRight className="h-3.5 w-3.5 mr-1" />
                                        🚀 Go to Jupyter
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
                            className="rounded-xl h-12 shadow-lg shadow-rose-200 font-bold bg-rose-500 hover:bg-rose-600 border-none text-white"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Bulk Delete Modal */}
            <AlertDialog open={showBulkDeleteModal} onOpenChange={setShowBulkDeleteModal}>
                <AlertDialogContent className="!bg-white !text-black border-none shadow-2xl rounded-[2rem] p-8 max-w-sm">
                    <AlertDialogHeader className="items-center text-center">
                        <div className="h-16 w-16 bg-rose-50 rounded-2xl flex items-center justify-center mb-4">
                            <Trash2 className="h-8 w-8 text-rose-500" />
                        </div>
                        <AlertDialogTitle className="text-xl font-black text-gray-900">Purge {selectedJobIds.length} Jobs?</AlertDialogTitle>
                        <AlertDialogDescription className="text-gray-500 text-xs mt-2 px-2">
                            This will permanently remove the selected jobs.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex flex-col sm:flex-col gap-2 mt-6">
                        <AlertDialogCancel className="rounded-xl font-bold h-10 border-gray-100">Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={confirmBulkDelete} 
                            className="rounded-xl h-12 shadow-lg shadow-rose-200 font-bold bg-rose-500 hover:bg-rose-600 border-none text-white"
                        >
                            Purge Records
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Integrated Apps Modal */}
            {isAppSelectorOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setIsAppSelectorOpen(false)}>
                    <Card className="w-full max-w-md bg-[#0a0a0a] border-white/10 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/[0.02]">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-primary" />
                                Integrated Apps
                            </h2>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-white" onClick={() => setIsAppSelectorOpen(false)}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <button 
                                onClick={() => { setSelectedApp('jupyter'); setIsAppSelectorOpen(false); }}
                                className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-orange-500/10 hover:border-orange-500/50 transition-all group"
                            >
                                <div className="h-16 w-16 rounded-full bg-orange-500/20 flex items-center justify-center p-3 group-hover:scale-110 transition-transform">
                                    <img src="https://jupyter.org/assets/homepage/main-logo.svg" alt="Jupyter Logo" className="w-full h-full object-contain" />
                                </div>
                                <span className="text-xs font-bold uppercase tracking-widest text-white/80 group-hover:text-white">Jupyter</span>
                            </button>
                            <button 
                                onClick={() => { setSelectedApp('python'); setIsAppSelectorOpen(false); }}
                                className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-emerald-500/10 hover:border-emerald-500/50 transition-all group"
                            >
                                <div className="h-16 w-16 rounded-full bg-emerald-500/20 flex items-center justify-center p-3 group-hover:scale-110 transition-transform">
                                    <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Python-logo-notext.svg/250px-Python-logo-notext.svg.png" alt="Python Logo" className="w-full h-full object-contain" />
                                </div>
                                <span className="text-xs font-bold uppercase tracking-widest text-white/80 group-hover:text-white">Python</span>
                            </button>
                        </div>
                    </Card>
                </div>
            )}

            {/* Job Info Modal */}
            <AlertDialog open={!!infoJob} onOpenChange={(o) => !o && setInfoJob(null)}>
                <AlertDialogContent className="bg-white rounded-2xl border-none shadow-2xl p-0 gap-0 w-[calc(100vw-2rem)] max-w-md sm:max-w-lg max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col">
                    <AlertDialogHeader className="px-5 sm:px-6 pt-5 sm:pt-6 pb-3 shrink-0 min-w-0">
                        <AlertDialogTitle className="text-xl font-black text-gray-900">
                            Job Details
                        </AlertDialogTitle>
                    </AlertDialogHeader>
                    <div className="space-y-3 px-5 sm:px-6 pb-2 overflow-y-auto min-h-0 max-w-full">
                        <div className="flex justify-between items-center gap-4 border-b border-gray-100 pb-2 min-w-0">
                            <span className="text-xs text-gray-400 uppercase font-bold tracking-widest shrink-0">Job ID</span>
                            <span className="text-sm font-mono text-gray-900 font-semibold min-w-0 text-right break-all">{infoJob?.slurm_job_id || infoJob?.id}</span>
                        </div>
                        <div className="flex justify-between items-center gap-4 border-b border-gray-100 pb-2 min-w-0">
                            <span className="text-xs text-gray-400 uppercase font-bold tracking-widest shrink-0">Status</span>
                            <Badge className={cn("border-none capitalize", 
                                infoStatus === 'RUNNING' ? "bg-primary/20 text-primary" :
                                infoStatus === 'PENDING' ? "bg-amber-100 text-amber-600" :
                                infoStatus === 'COMPLETED' ? "bg-emerald-100 text-emerald-600" :
                                infoStatus === 'FAILED' ? "bg-rose-100 text-rose-600" :
                                "bg-gray-100 text-gray-600"
                            )}>
                                {infoStatus === 'PENDING' ? 'Queued / starting' : (infoStatus || infoJob?.status)}
                            </Badge>
                        </div>
                        <div className="flex justify-between items-center gap-4 border-b border-gray-100 pb-2 min-w-0">
                            <span className="text-xs text-gray-400 uppercase font-bold tracking-widest shrink-0">CPU</span>
                            <span className="text-sm font-mono text-gray-900 font-semibold min-w-0 text-right break-all">{(infoJob as any)?.total_cpu || 1}</span>
                        </div>
                        <div className="flex justify-between items-center gap-4 border-b border-gray-100 pb-2 min-w-0">
                            <span className="text-xs text-gray-400 uppercase font-bold tracking-widest shrink-0">RAM</span>
                            <span className="text-sm font-mono text-gray-900 font-semibold min-w-0 text-right break-all">{(infoJob as any)?.total_ram || 1} GB</span>
                        </div>
                        <div className="flex justify-between items-center gap-4 border-b border-gray-100 pb-2 min-w-0">
                            <span className="text-xs text-gray-400 uppercase font-bold tracking-widest shrink-0">Time</span>
                            <span className="text-sm font-mono text-gray-900 font-semibold min-w-0 text-right break-all">{infoStatus === 'RUNNING' && infoJob ? (elapsedTimes[infoJob.id] || '00:00:00') : ((infoJob as any)?.walltime || '04:00:00')}</span>
                        </div>

                        <div className="mt-4 min-w-0">
                            <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest block mb-2">Primary Output / Environment Trace</span>
                            <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 sm:p-4 text-[11px] font-mono whitespace-pre-wrap break-words [overflow-wrap:anywhere] [word-break:break-word] max-w-full max-h-[34dvh] sm:max-h-56 overflow-auto leading-relaxed text-gray-700 overscroll-contain">
                                {infoTrace ||
                                 (infoStatus === 'WAITING' ? 'Queued due to quota. Waiting for resources to become available.' :
                                  infoStatus === 'PENDING' ? 'Job accepted by Slurm. It is queued or starting.' :
                                  "No trace data recorded.")}
                            </div>
                        </div>
                    </div>
                    <AlertDialogFooter className="px-5 sm:px-6 pt-4 pb-5 sm:pb-6 shrink-0">
                        <AlertDialogCancel className="w-full bg-gray-100 hover:bg-gray-200 text-gray-900 border-none h-10 rounded-xl font-bold transition-colors mt-0">Close</AlertDialogCancel>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
