import React, { useEffect, useState, useRef } from 'react';
import { jobsApi } from '@/api/jobs';
import { filesApi } from '@/api/files';
import { useAuth } from '@/context/useAuth'
import PageLoader from '@/components/PageLoader';
import { ControllerFailureAlert } from '@/components/ControllerFailureAlert';
import {
    Search, RefreshCcw, Trash2, Monitor, XCircle,
    Terminal, ChevronRight, Play, Info, Signal,
    Orbit, Power, Loader2, Sparkles, X, Send,
    ExternalLink, Rocket, Activity, Clock,
    CheckCircle2, Ban, Layers
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
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { MetricCard } from "@/components/shared/MetricCard";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiErrorMessage } from "@/api/errors";

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

const JOB_STATUS_TONES: Record<string, { badge: string; dot: string }> = {
    RUNNING: { badge: 'bg-primary/10 text-primary border-primary/25', dot: 'bg-primary animate-pulse' },
    PENDING: { badge: 'bg-warning/10 text-warning border-warning/25', dot: 'bg-warning' },
    WAITING: { badge: 'bg-info/10 text-info border-info/20', dot: 'bg-info' },
    COMPLETED: { badge: 'bg-success/10 text-success border-success/20', dot: 'bg-success' },
    FAILED: { badge: 'bg-destructive/10 text-destructive border-destructive/20', dot: 'bg-destructive' },
    CANCELLED: { badge: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground/60' },
};

const jobStatusLabel = (status: string) =>
    status === 'PENDING' ? 'Queued / starting' :
    status === 'WAITING' ? 'Waiting for quota' :
    status;

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
        } catch (err) {
            console.error(err);
            setError(apiErrorMessage(err, "Failed to synchronize job registry."));
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
        } catch (err) {
            toast.error(apiErrorMessage(err, "Job submission failed."));
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
        } catch (err) {
            toast.error(apiErrorMessage(err, "Bulk cleanup encountered resistance"));
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
        } catch (err) {
            toast.error(apiErrorMessage(err, "Cleanup failed"));
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
        } catch (err) {
            toast.error(apiErrorMessage(err, "Stop failed"));
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
        } catch {
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
        } catch (err) {
            toast.error(apiErrorMessage(err, "Jupyter launch failed."));
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
            } catch (err) {
                if (!(err instanceof DOMException && err.name === 'AbortError')) {
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
        <div className="flex h-full flex-col gap-3">
            {showHeader && (
                <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{filteredJobs.length}</span> total
                    </p>
                    {!isAdmin && selectedJobIds.length > 0 && (
                        <Button
                            onClick={() => setShowBulkDeleteModal(true)}
                            size="sm"
                            variant="destructive"
                            className="h-8 px-3 text-xs"
                        >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            Delete ({selectedJobIds.length})
                        </Button>
                    )}
                </div>
            )}

            <div className="flex-1 overflow-hidden rounded-lg border border-border bg-card shadow-xs">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-border bg-muted/50">
                                <th className="w-10 px-3 py-2.5">
                                    {!isAdmin && (
                                        <input
                                            type="checkbox"
                                            className="h-3.5 w-3.5 cursor-pointer rounded border-input accent-primary"
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
                                <th className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Job</th>
                                {isAdmin && (
                                    <th className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Owner</th>
                                )}
                                <th className="px-3 py-2.5 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</th>
                                {isAdmin && (
                                    <th className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Script</th>
                                )}
                                <th className="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {filteredJobs.length === 0 ? (
                                <tr>
                                    <td colSpan={isAdmin ? 5 : 3} className="px-3 py-12 text-center">
                                        <div className="text-xs text-muted-foreground">No jobs found</div>
                                    </td>
                                </tr>
                            ) : (
                                filteredJobs.map((j) => (
                                    <tr key={j.id} className={cn("transition-colors hover:bg-accent/40", selectedJobIds.includes(j.id) && "bg-primary/5")}>
                                        <td className="px-3 py-2.5">
                                            {!isAdmin && (
                                                <input
                                                    type="checkbox"
                                                    disabled={j.status === 'RUNNING'}
                                                    className={cn("h-3.5 w-3.5 cursor-pointer rounded border-input accent-primary", j.status === 'RUNNING' && "cursor-not-allowed opacity-50")}
                                                    checked={selectedJobIds.includes(j.id)}
                                                    onChange={() => toggleJobSelection(j.id)}
                                                />
                                            )}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <div className="flex items-center gap-2.5">
                                                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                                                    <Terminal className={cn("h-4 w-4", j.status === 'RUNNING' ? "animate-pulse text-primary" : "text-muted-foreground")} />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-medium text-foreground">{j.job_name}</div>
                                                    <div className="text-[11px] text-muted-foreground">{j.slurm_job_id ? `#${j.slurm_job_id}` : `ID: ${j.id}`}</div>
                                                </div>
                                            </div>
                                        </td>
                                        {isAdmin && (
                                            <td className="px-3 py-2.5">
                                                <span className="text-xs text-muted-foreground">{j.owner?.username || '-'}</span>
                                            </td>
                                        )}
                                        <td className="px-3 py-2.5 text-center">
                                            <Badge variant="outline" className={cn('gap-1.5 font-medium', (JOB_STATUS_TONES[j.status] ?? JOB_STATUS_TONES.CANCELLED).badge)}>
                                                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', (JOB_STATUS_TONES[j.status] ?? JOB_STATUS_TONES.CANCELLED).dot)} aria-hidden />
                                                {jobStatusLabel(j.status)}
                                            </Badge>
                                        </td>
                                        {isAdmin && (
                                            <td className="px-3 py-2.5">
                                                <span className="block max-w-[150px] truncate text-xs text-muted-foreground">{j.script_path?.split('/').pop() || '-'}</span>
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
                                                        className="h-7 w-7 p-0 text-success hover:bg-success/10 hover:text-success"
                                                        title="Open Jupyter"
                                                        aria-label="Open Jupyter"
                                                    >
                                                        <ExternalLink className="h-3.5 w-3.5" />
                                                    </Button>
                                                )}
                                                <Button
                                                    onClick={() => setInfoJob(j)}
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 w-7 p-0 text-info hover:bg-info/10 hover:text-info"
                                                    title="View Info"
                                                    aria-label="View job details"
                                                >
                                                    <Info className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    onClick={() => setMonitoringJob(j)}
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                                    aria-label="Monitor job logs"
                                                >
                                                    <Monitor className="h-3.5 w-3.5" />
                                                </Button>

                                                {['RUNNING', 'PENDING'].includes(j.status) ? (
                                                    <Button
                                                        onClick={() => setJobToStop(j)}
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 w-7 border-warning/30 p-0 text-warning hover:bg-warning/10 hover:text-warning"
                                                        aria-label="Stop job"
                                                    >
                                                        <XCircle className="h-3.5 w-3.5" />
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        onClick={() => handleDeleteJob(j)}
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 w-7 border-destructive/30 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                        aria-label="Delete job"
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
            </div>
        </div>
    );

    return (
        <div className="flex flex-col pb-4">
            <PageHeader
                title="Jobs"
                description={isAdmin ? "Manage all cluster jobs" : "View and submit jobs"}
                actions={
                    <>
                        {isAdmin && (
                            <>
                                <select
                                    aria-label="Filter by owner"
                                    className="h-8 rounded-md border border-input bg-card px-2 text-xs"
                                    value={ownerFilter}
                                    onChange={(e) => setOwnerFilter(e.target.value)}
                                >
                                    <option value="ALL">All Owners</option>
                                    {Array.from(new Set(jobs.map(j => j.owner?.username).filter(Boolean))).map(u => (
                                        <option key={u} value={u!}>{u}</option>
                                    ))}
                                </select>
                                <select
                                    aria-label="Filter by status"
                                    className="h-8 rounded-md border border-input bg-card px-2 text-xs"
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
                            </>
                        )}
                        {!isAdmin && (
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                                <Input
                                    placeholder="Search jobs..."
                                    className="h-8 pl-9 text-xs"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    aria-label="Search jobs"
                                />
                            </div>
                        )}
                        <Button
                            onClick={() => fetchJobs()}
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0"
                            aria-label="Refresh jobs"
                        >
                            <RefreshCcw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
                        </Button>
                    </>
                }
            />

            {isAdmin && (
                <div className="grid grid-cols-2 gap-2 pb-4 sm:grid-cols-5">
                    <MetricCard label="Running" value={stats.running} icon={Activity} tone="primary" />
                    <MetricCard label="Queued" value={stats.pending} icon={Clock} tone="warning" />
                    <MetricCard label="Completed" value={stats.completed} icon={CheckCircle2} tone="success" />
                    <MetricCard label="Failed" value={stats.failed} icon={XCircle} tone="danger" />
                    <MetricCard label="Cancelled" value={stats.cancelled} icon={Ban} tone="neutral" />
                </div>
            )}

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
                {!isAdmin && (
                    <div className="flex h-full flex-col gap-3 lg:col-span-4">
                        <Button
                            onClick={() => setIsAppSelectorOpen(true)}
                            variant="outline"
                            className="h-12 w-full justify-center gap-2 rounded-lg text-sm font-medium"
                        >
                            <Sparkles className="h-4 w-4 text-primary" />
                            Integrated Apps
                        </Button>

                        {!selectedApp && (
                            <EmptyState
                                icon={Layers}
                                title="Select an App"
                                description="Choose an integrated app to configure and launch."
                                className="mt-2 flex-1"
                            />
                        )}

                        {selectedApp === 'jupyter' && (
                        <Card className="rounded-lg shadow-xs">
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="flex items-center gap-2 text-base font-semibold">
                                        <Orbit className="h-4 w-4 text-primary" />
                                        Jupyter Lab
                                    </CardTitle>
                                    <Badge variant="secondary" size="sm">Interactive</Badge>
                                </div>
                                <CardDescription className="text-xs">
                                    Launch an interactive notebook session
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <Label className="text-xs font-medium">CPU Cores</Label>
                                        <Input
                                            type="text"
                                            inputMode="numeric"
                                            min={1}
                                            max={isAdmin ? 128 : quotas.cpu_limit}
                                            value={jupyterResources.total_cpu}
                                            onChange={(e) => setJupyterResources({...jupyterResources, total_cpu: e.target.value.replace(/[^\d]/g, '')})}
                                            onBlur={(e) => setJupyterResources({...jupyterResources, total_cpu: normalizeIntInput(e.target.value, 1)})}
                                            className="h-9 min-w-0 text-xs"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs font-medium">RAM (GB)</Label>
                                        <Input
                                            type="text"
                                            inputMode="numeric"
                                            min={1}
                                            max={isAdmin ? 512 : quotas.memory_limit_gb}
                                            value={jupyterResources.total_ram}
                                            onChange={(e) => setJupyterResources({...jupyterResources, total_ram: e.target.value.replace(/[^\d]/g, '')})}
                                            onBlur={(e) => setJupyterResources({...jupyterResources, total_ram: normalizeIntInput(e.target.value, 1)})}
                                            className="h-9 min-w-0 text-xs"
                                        />
                                    </div>
                                    <div className="col-span-2 space-y-1">
                                        <Label className="text-xs font-medium">Wall Time</Label>
                                        <Input
                                            placeholder="HH:MM:SS"
                                            value={jupyterResources.walltime}
                                            onChange={(e) => setJupyterResources({...jupyterResources, walltime: e.target.value})}
                                            onBlur={(e) => setJupyterResources({...jupyterResources, walltime: normalizeWalltime(e.target.value, 1800)})}
                                            className="h-9 min-w-0 font-mono text-xs"
                                        />
                                    </div>
                                </div>

                                <Button
                                    onClick={handleLaunchJupyter}
                                    disabled={submitting}
                                    size="sm"
                                    className="w-full"
                                >
                                    <Play className="mr-1.5 h-3.5 w-3.5" />
                                    Launch
                                </Button>

                                {!isAdmin && (
                                    <p className="text-center text-[11px] text-muted-foreground">
                                        Quota: {quotas.cpu_limit}C / {quotas.memory_limit_gb}G
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                        )}

                        {selectedApp === 'python' && scriptsLoading ? (
                        <Card className="flex-1 rounded-lg shadow-xs">
                            <CardContent className="flex flex-col items-center justify-center gap-3 py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Loading environment...</p>
                            </CardContent>
                        </Card>
                        ) : selectedApp === 'python' && (
                        <Card className="flex-1 rounded-lg shadow-xs">
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="flex items-center gap-2 text-base font-semibold">
                                        <Terminal className="h-4 w-4 text-success" />
                                        Python App
                                    </CardTitle>
                                    <Badge variant="success" size="sm">Batch</Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleSubmit} className="space-y-3">
                                    <div className="space-y-1">
                                        <Label htmlFor="job_name" className="text-xs font-medium">Job Name</Label>
                                        <Input
                                            id="job_name"
                                            placeholder="Example: training_run_01"
                                            className="h-9 min-w-0 text-xs"
                                            value={formData.job_name}
                                            onChange={(e) => setFormData({...formData, job_name: e.target.value})}
                                            required
                                        />
                                    </div>

                                    <div ref={dropdownRef} className="space-y-1">
                                        <Label className="text-xs font-medium">Script</Label>
                                        <div className="relative">
                                            <div
                                                className={cn(
                                                    "flex h-9 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-xs transition-colors hover:bg-accent/40",
                                                    openDropdown === 'script' && "border-primary/50 ring-2 ring-primary/15"
                                                )}
                                                onClick={() => setOpenDropdown(openDropdown === 'script' ? null : 'script')}
                                            >
                                                <span className={cn("min-w-0 truncate font-medium", formData.script_path ? "text-foreground" : "text-muted-foreground")}>
                                                    {formData.script_path ? formData.script_path.split('/').pop() : "Select script"}
                                                </span>
                                                <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", openDropdown === 'script' && "rotate-90 text-primary")} />
                                            </div>

                                            {openDropdown === 'script' && (
                                                <div className="absolute left-0 top-[calc(100%+4px)] z-50 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-md">
                                                    {scripts.length === 0 ? (
                                                        <div className="px-3 py-2 italic text-[11px] text-muted-foreground">No executable scripts discovered</div>
                                                    ) : scripts.map(s => (
                                                        <div
                                                            key={s.path}
                                                            className="cursor-pointer truncate px-3 py-2 text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
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

                                    <div ref={reqDropdownRef} className="space-y-1">
                                        <Label className="text-xs font-medium">Requirements (.txt)</Label>
                                        <div className="relative">
                                            <div
                                                className={cn(
                                                    "flex h-9 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-xs transition-colors hover:bg-accent/40",
                                                    openDropdown === 'req' && "border-primary/50 ring-2 ring-primary/15"
                                                )}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenDropdown(openDropdown === 'req' ? null : 'req');
                                                }}
                                            >
                                                <span className={cn("min-w-0 truncate font-medium", formData.requirements_path ? "text-foreground" : "text-muted-foreground")}>
                                                    {formData.requirements_path ? formData.requirements_path.split('/').pop() : "Optional requirements.txt"}
                                                </span>
                                                <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200", openDropdown === 'req' && "rotate-90 text-primary")} />
                                            </div>

                                            {openDropdown === 'req' && (
                                                <div className="absolute left-0 top-[calc(100%+4px)] z-50 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-md">
                                                    <div
                                                        className="cursor-pointer px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-destructive transition-colors hover:bg-destructive/10"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setFormData({...formData, requirements_path: ''});
                                                            setOpenDropdown(null);
                                                        }}
                                                    >
                                                        -- Skip Dependency Injection --
                                                    </div>
                                                    {textFiles.length === 0 ? (
                                                        <div className="px-3 py-2 italic text-[11px] text-muted-foreground">No requirements files found</div>
                                                    ) : textFiles.map(s => (
                                                        <div
                                                            key={s.path}
                                                            className="cursor-pointer truncate border-t border-border px-3 py-2 text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
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
                                        <div className="space-y-1">
                                            <Label className="text-xs font-medium">CPU Cores</Label>
                                            <Input
                                                type="text"
                                                min={1}
                                                inputMode="numeric"
                                                className="h-9 min-w-0 text-xs"
                                                value={formData.total_cpu}
                                                onChange={(e) => setFormData({...formData, total_cpu: e.target.value.replace(/[^\d]/g, '')})}
                                                onBlur={(e) => setFormData({...formData, total_cpu: normalizeIntInput(e.target.value, 1)})}
                                                required
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs font-medium">RAM (GB)</Label>
                                            <Input
                                                type="text"
                                                min={1}
                                                inputMode="numeric"
                                                className="h-9 min-w-0 text-xs"
                                                value={formData.total_ram}
                                                onChange={(e) => setFormData({...formData, total_ram: e.target.value.replace(/[^\d]/g, '')})}
                                                onBlur={(e) => setFormData({...formData, total_ram: normalizeIntInput(e.target.value, 1)})}
                                                required
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs font-medium">Wall Time</Label>
                                            <Input
                                                placeholder="HH:MM:SS"
                                                pattern="[0-9]{2}:[0-9]{2}:[0-9]{2}"
                                                className="h-9 min-w-0 font-mono text-xs"
                                                value={formData.walltime}
                                                onChange={(e) => setFormData({...formData, walltime: e.target.value})}
                                                onBlur={(e) => setFormData({...formData, walltime: normalizeWalltime(e.target.value, 60)})}
                                                required
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs font-medium">GPU (Optional)</Label>
                                            <Input
                                                type="text"
                                                min={0}
                                                inputMode="numeric"
                                                className="h-9 min-w-0 text-xs"
                                                value={formData.gpu_count}
                                                onChange={(e) => setFormData({...formData, gpu_count: e.target.value.replace(/[^\d]/g, '')})}
                                                onBlur={(e) => setFormData({...formData, gpu_count: normalizeIntInput(e.target.value, 0)})}
                                            />
                                        </div>
                                        <div className="col-span-2 space-y-1">
                                            <Label className="text-xs font-medium">Job Type</Label>
                                            <select
                                                className="mt-1 h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 text-xs outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
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
                                        className="mt-4 w-full"
                                    >
                                        <Send className="mr-2 h-4 w-4" />
                                        {submitting ? 'Submitting...' : 'Submit Job'}
                                    </Button>

                                    {!isAdmin && (
                                        <p className="px-1 text-right text-[11px] text-muted-foreground">
                                            Available: {Math.max(0, quotas.cpu_limit - quotas.cpu_used)}C / {Math.max(0, quotas.memory_limit_gb - quotas.ram_used)}G
                                        </p>
                                    )}
                                </form>
                            </CardContent>
                        </Card>
                        )}
                    </div>
                )}

                <div className={cn(
                    "flex h-full flex-col overflow-hidden",
                    isAdmin ? "lg:col-span-12" : "lg:col-span-8"
                )}>
                    <JobList />
                </div>
            </div>

            {/* Monitoring Nexus Modal */}
            <AlertDialog open={!!monitoringJob} onOpenChange={(o) => !o && setMonitoringJob(null)}>
                <AlertDialogContent className="flex h-[80vh] max-w-5xl flex-col overflow-hidden rounded-lg border-border bg-card p-0 shadow-lg">
                    <AlertDialogHeader className="shrink-0 space-y-0 border-b border-border bg-muted/40 p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10">
                                    <Terminal className={cn("h-5 w-5 text-primary", isLive && "animate-pulse")} />
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                        <Signal className="h-3 w-3" />
                                        <span>{monitoringJob?.status}</span>
                                    </div>
                                    <AlertDialogTitle className="truncate text-base font-semibold tracking-tight">{monitoringJob?.job_name}</AlertDialogTitle>
                                    <AlertDialogDescription className="font-mono text-[11px] tracking-tight">
                                        ID: {monitoringJob?.slurm_job_id || 'LOCAL_IO'}
                                    </AlertDialogDescription>
                                </div>
                            </div>
                             <div className="flex shrink-0 items-center gap-2">
                                {monitoringJob?.script_path === "__jupyter__" && monitoringJob?.status === 'RUNNING' && (
                                    <Button
                                        onClick={() => handleOpenJupyter(monitoringJob)}
                                        size="sm"
                                        variant="outline"
                                        className="h-8 gap-1.5 border-success/30 px-3 text-xs font-medium text-success hover:bg-success/10 hover:text-success"
                                    >
                                        <Rocket className="h-3.5 w-3.5" />
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
                                    variant="outline"
                                    className="h-8 px-3 text-xs"
                                >
                                    Copy Logs
                                </Button>
                                <Badge size="sm" className={cn("rounded-md", isLive ? "border-success/25 bg-success/15 text-success" : "border-border bg-muted text-muted-foreground")}>
                                    {isLive ? 'Link Active' : 'Stable'}
                                </Badge>
                                <Button
                                    onClick={() => setMonitoringJob(null)}
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8"
                                    aria-label="Close log viewer"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </AlertDialogHeader>

                    <div className="min-h-0 flex-1 overflow-hidden bg-[#0b0c10]">
                        <div className="h-full overflow-y-auto bg-[#0b0c10] font-mono text-[11px] leading-relaxed selection:bg-primary/40">
                            {liveLogs ? (
                                <div className="flex min-h-full select-text cursor-text flex-col gap-1 p-4">
                                    <div className="mb-4 flex items-center gap-2 border-b border-neutral-800 pb-2 text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">
                                        <Terminal className="h-3 w-3" />
                                        <span>Workload Telemetry Nexus v4.0.0-PROD</span>
                                    </div>
                                    {liveLogs.split('\n').map((line, i) => {
                                        const isError = line.toLowerCase().includes('error') || line.toLowerCase().includes('fail') || line.toLowerCase().includes('exception');
                                        return (
                                            <div key={i} className="group relative -mx-4 flex gap-4 px-4 py-0.5 transition-colors select-text hover:bg-neutral-800/40 cursor-text">
                                                <span className="w-8 select-none border-r border-neutral-800 pr-3 text-right font-mono text-neutral-600">{i + 1}</span>
                                                <span className={cn(
                                                    "flex-1 break-all whitespace-pre-wrap font-medium select-text",
                                                    isError ? "font-bold text-rose-400" : "text-neutral-200"
                                                )}>
                                                    {line || <br />}
                                                </span>
                                            </div>
                                        );
                                    })}
                                    <div className="-mx-4 mt-2 flex gap-4 bg-primary/10 px-4 py-1">
                                        <span className="w-8 select-none pr-3 text-right text-neutral-600">::</span>
                                        <div className="flex items-center gap-2 animate-pulse font-bold text-[10px] text-primary">
                                            <Signal className="h-3 w-3" />
                                            <span>Stream Synchronized</span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center gap-3 p-10 py-20 text-center opacity-80">
                                  <Loader2 className="mb-4 h-8 w-8 animate-spin text-success" />
                                  <div className="w-full max-w-sm space-y-2">
                                      <div className="h-1 w-full overflow-hidden rounded-full bg-success/20">
                                          <div className="h-full w-1/3 animate-[shimmer_2s_infinite] bg-success/40" />
                                      </div>
                                      <div className="mx-auto h-1 w-2/3 rounded-full bg-success/10" />
                                  </div>
                                  <div className="mt-6 animate-pulse text-[10px] font-bold uppercase tracking-widest text-success">Establishing Signal...</div>
                                </div>
                            )}
                        </div>
                    </div>
                </AlertDialogContent>
            </AlertDialog>

            {/* Stop Job Confirmation */}
            <AlertDialog open={!!jobToStop} onOpenChange={(o) => !o && setJobToStop(null)}>
                <AlertDialogContent className="max-w-sm rounded-lg">
                    <AlertDialogHeader className="items-center space-y-2 text-center">
                        <div className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-lg bg-warning/10">
                            <Power className="h-6 w-6 text-warning" />
                        </div>
                        <AlertDialogTitle>Stop Job?</AlertDialogTitle>
                        <AlertDialogDescription className="text-xs">
                           This will stop <span className="font-semibold text-warning">{jobToStop?.job_name}</span> immediately.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-2">
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmStopJob}
                            className="bg-warning text-warning-foreground hover:bg-warning/90"
                        >
                            Stop Job
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={!!jobToDelete} onOpenChange={(o) => !o && setJobToDelete(null)}>
                <AlertDialogContent className="max-w-sm rounded-lg">
                    <AlertDialogHeader className="items-center space-y-2 text-center">
                        <div className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-lg bg-destructive/10">
                            <Trash2 className="h-6 w-6 text-destructive" />
                        </div>
                        <AlertDialogTitle>Delete Job?</AlertDialogTitle>
                        <AlertDialogDescription className="text-xs">
                            This will remove <span className="font-semibold text-destructive">"{jobToDelete?.job_name}"</span> from the list permanently.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-2">
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDeleteJob}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Bulk Delete Modal */}
            <AlertDialog open={showBulkDeleteModal} onOpenChange={setShowBulkDeleteModal}>
                <AlertDialogContent className="max-w-sm rounded-lg">
                    <AlertDialogHeader className="items-center space-y-2 text-center">
                        <div className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-lg bg-destructive/10">
                            <Trash2 className="h-6 w-6 text-destructive" />
                        </div>
                        <AlertDialogTitle>Purge {selectedJobIds.length} Jobs?</AlertDialogTitle>
                        <AlertDialogDescription className="text-xs">
                            This will permanently remove the selected jobs.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-2">
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmBulkDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Purge Records
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Integrated Apps Modal */}
            {isAppSelectorOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setIsAppSelectorOpen(false)}>
                    <Card className="w-full max-w-md overflow-hidden rounded-lg border-border bg-popover shadow-lg" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-border p-4">
                            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                <Sparkles className="h-4 w-4 text-primary" />
                                Integrated Apps
                            </h2>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setIsAppSelectorOpen(false)} aria-label="Close app selector">
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="grid grid-cols-1 gap-3 p-6 sm:grid-cols-2">
                            <button
                                onClick={() => { setSelectedApp('jupyter'); setIsAppSelectorOpen(false); }}
                                className="group flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card p-6 transition-colors hover:border-ring/40 hover:bg-accent/40"
                            >
                                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted p-3">
                                    <img src="https://jupyter.org/assets/homepage/main-logo.svg" alt="Jupyter Logo" className="h-full w-full object-contain" />
                                </div>
                                <span className="text-xs font-medium text-foreground">Jupyter</span>
                            </button>
                            <button
                                onClick={() => { setSelectedApp('python'); setIsAppSelectorOpen(false); }}
                                className="group flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card p-6 transition-colors hover:border-ring/40 hover:bg-accent/40"
                            >
                                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted p-3">
                                    <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Python-logo-notext.svg/250px-Python-logo-notext.svg.png" alt="Python Logo" className="h-full w-full object-contain" />
                                </div>
                                <span className="text-xs font-medium text-foreground">Python</span>
                            </button>
                        </div>
                    </Card>
                </div>
            )}

            {/* Job Info Modal */}
            <AlertDialog open={!!infoJob} onOpenChange={(o) => !o && setInfoJob(null)}>
                <AlertDialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md flex-col gap-0 overflow-hidden rounded-lg p-0 sm:max-w-lg">
                    <AlertDialogHeader className="min-w-0 shrink-0 space-y-1 px-5 pb-3 pt-5 sm:px-6 sm:pt-6">
                        <AlertDialogTitle className="text-base font-semibold">
                            Job Details
                        </AlertDialogTitle>
                    </AlertDialogHeader>
                    <div className="min-h-0 max-w-full space-y-3 overflow-y-auto px-5 pb-2 sm:px-6">
                        <div className="flex min-w-0 items-center justify-between gap-4 border-b border-border pb-2">
                            <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">Job ID</dt>
                            <dd className="min-w-0 break-all text-right font-mono text-sm font-medium text-foreground">{infoJob?.slurm_job_id || infoJob?.id}</dd>
                        </div>
                        <div className="flex min-w-0 items-center justify-between gap-4 border-b border-border pb-2">
                            <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</dt>
                            <dd className="min-w-0">
                                <StatusBadge status={infoStatus || undefined} label={infoStatus === 'PENDING' ? 'Queued / starting' : undefined} />
                            </dd>
                        </div>
                        <div className="flex min-w-0 items-center justify-between gap-4 border-b border-border pb-2">
                            <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">CPU</dt>
                            <dd className="min-w-0 break-all text-right font-mono text-sm font-medium text-foreground">{infoJob?.total_cpu || 1}</dd>
                        </div>
                        <div className="flex min-w-0 items-center justify-between gap-4 border-b border-border pb-2">
                            <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">RAM</dt>
                            <dd className="min-w-0 break-all text-right font-mono text-sm font-medium text-foreground">{infoJob?.total_ram || 1} GB</dd>
                        </div>
                        <div className="flex min-w-0 items-center justify-between gap-4 border-b border-border pb-2">
                            <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">Time</dt>
                            <dd className="min-w-0 break-all text-right font-mono text-sm font-medium text-foreground">{infoStatus === 'RUNNING' && infoJob ? (elapsedTimes[infoJob.id] || '00:00:00') : (infoJob?.walltime || '04:00:00')}</dd>
                        </div>

                        <div className="mt-4 min-w-0">
                            <span className="mb-2 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Primary Output / Environment Trace</span>
                            <div className="max-h-[34dvh] max-w-full overflow-auto overscroll-contain whitespace-pre-wrap break-words rounded-md border border-border bg-muted/50 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere] [word-break:break-word] sm:max-h-56">
                                {infoTrace ||
                                 (infoStatus === 'WAITING' ? 'Queued due to quota. Waiting for resources to become available.' :
                                  infoStatus === 'PENDING' ? 'Job accepted by Slurm. It is queued or starting.' :
                                  "No trace data recorded.")}
                            </div>
                        </div>
                    </div>
                    <AlertDialogFooter className="shrink-0 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
                        <AlertDialogCancel className="w-full sm:w-auto">Close</AlertDialogCancel>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
