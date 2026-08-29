import { useEffect, useState, useCallback } from "react";
import {
    Server, Play, Plus, RefreshCw,
    CheckCircle2, XCircle, Clock, Loader2,
    ChevronDown, ChevronUp, Terminal, AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAuth } from '@/context/useAuth'
import {
    clusterManageApi,
    type ClusterTaskStatus,
    type ClusterTaskSummary,
} from "@/api/clusterManage";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { apiErrorMessage } from "@/api/errors";

const STATUS_ICONS = {
    started: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
    running: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
    completed: <CheckCircle2 className="h-4 w-4 text-success" />,
    failed: <XCircle className="h-4 w-4 text-destructive" />,
    timeout: <AlertTriangle className="h-4 w-4 text-warning" />,
    error: <AlertTriangle className="h-4 w-4 text-destructive" />,
    unknown: <Clock className="h-4 w-4 text-muted-foreground" />,
};

const STATUS_BADGE = {
    started: "bg-primary/10 text-primary border-primary/20",
    running: "bg-primary/10 text-primary border-primary/20",
    completed: "bg-success/10 text-success border-success/20",
    failed: "bg-destructive/10 text-destructive border-destructive/20",
    timeout: "bg-warning/10 text-warning border-warning/20",
    error: "bg-destructive/10 text-destructive border-destructive/20",
    unknown: "bg-muted text-muted-foreground border-muted",
};

function formatAge(iso?: string): string {
    if (!iso) return "—";
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

export default function ClusterManagementPage() {
    const { token } = useAuth();

    const [history, setHistory] = useState<ClusterTaskSummary[]>([]);
    const [selectedTask, setSelectedTask] = useState<ClusterTaskStatus | null>(null);
    const [taskLogs, setTaskLogs] = useState<{ stdout: string; stderr: string } | null>(null);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [pollingTask, setPollingTask] = useState<string | null>(null);

    const [appendForm, setAppendForm] = useState({
        node_ip: "",
        node_name: "",
        ssh_port: "22",
        ssh_user: "root",
        ssh_password: "",
        node_os: "ubuntu",
    });
    const [runningSetup, setRunningSetup] = useState(false);
    const [runningAppend, setRunningAppend] = useState(false);
    const [logsExpanded, setLogsExpanded] = useState(false);

    const fetchHistory = useCallback(async () => {
        if (!token) return;
        setLoadingHistory(true);
        try {
            const res = await clusterManageApi.listHistory(token);
            setHistory(res.data);
        } catch (err) {
            console.error("Failed to fetch history", err);
        } finally {
            setLoadingHistory(false);
        }
    }, [token]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    const pollStatus = useCallback(async (taskId: string) => {
        if (!token) return;
        try {
            const res = await clusterManageApi.getStatus(token, taskId);
            setSelectedTask(res.data);
            if (res.data.status === "running" || res.data.status === "started") {
                setTimeout(() => pollStatus(taskId), 5000);
            } else {
                setPollingTask(null);
                fetchHistory();
            }
        } catch (err) {
            console.error("Poll failed", err);
            setPollingTask(null);
        }
    }, [token, fetchHistory]);

    const handleRunSetup = async () => {
        if (!token) return;
        setRunningSetup(true);
        try {
            const res = await clusterManageApi.runSetup(token);
            const taskId = res.data.task_id;
            toast.success("Cluster setup started.");
            setPollingTask(taskId);
            pollStatus(taskId);
        } catch (err: any) {
            const msg = apiErrorMessage(err, "Failed to start cluster setup.");
            toast.error(msg);
        } finally {
            setRunningSetup(false);
        }
    };

    const handleRunAppend = async () => {
        if (!token) return;
        if (!appendForm.node_ip || !appendForm.node_name) {
            toast.error("Node IP and name are required.");
            return;
        }
        setRunningAppend(true);
        try {
            const res = await clusterManageApi.runAppend(token, {
                node_ip: appendForm.node_ip,
                node_name: appendForm.node_name,
                ssh_port: parseInt(appendForm.ssh_port) || 22,
                ssh_user: appendForm.ssh_user || "root",
                ssh_password: appendForm.ssh_password || undefined,
                node_os: appendForm.node_os,
            });
            const taskId = res.data.task_id;
            toast.success("Node append started.");
            setPollingTask(taskId);
            pollStatus(taskId);
            setAppendForm({ node_ip: "", node_name: "", ssh_port: "22", ssh_user: "root", ssh_password: "", node_os: "ubuntu" });
        } catch (err: any) {
            const msg = apiErrorMessage(err, "Failed to start node append.");
            toast.error(msg);
        } finally {
            setRunningAppend(false);
        }
    };

    const handleSelectTask = async (task: ClusterTaskSummary) => {
        if (!token) return;
        setLogsExpanded(true);
        try {
            const statusRes = await clusterManageApi.getStatus(token, task.task_id);
            setSelectedTask(statusRes.data);
            try {
                const logsRes = await clusterManageApi.getLogs(token, task.task_id);
                setTaskLogs(logsRes.data);
            } catch {
                setTaskLogs({ stdout: "Logs not available yet.", stderr: "" });
            }
        } catch (err) {
            console.error("Failed to load task details", err);
        }
    };

    return (
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 pb-4">
            <PageHeader
                title="Cluster Management"
                description={
                    <span className="inline-flex items-center gap-1.5">
                        <Server className="h-3 w-3" aria-hidden />
                        Run cluster setup and manage compute nodes
                    </span>
                }
                actions={
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchHistory}
                        aria-label="Refresh history"
                    >
                        <RefreshCw className={cn("h-3.5 w-3.5", loadingHistory && "animate-spin")} />
                    </Button>
                }
            />

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <div className="space-y-4 xl:col-span-2">
                    <Card className="rounded-lg border-border shadow-xs">
                        <CardHeader className="border-b border-border px-4 py-3 [.border-b]:pb-3">
                            <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                <Play className="h-3.5 w-3.5 text-primary" aria-hidden />
                                Full Cluster Setup
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 p-4">
                            <p className="text-sm text-muted-foreground">
                                Run the full cluster setup playbook to configure the head node, job scheduler,
                                authentication, and discover compute nodes. This may take several minutes.
                            </p>
                            <Button
                                onClick={handleRunSetup}
                                disabled={runningSetup || runningAppend || !!pollingTask}
                                className="w-full"
                            >
                                {runningSetup ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running...</>
                                ) : (
                                    <><Play className="mr-2 h-4 w-4" /> Run Cluster Setup</>
                                )}
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="rounded-lg border-border shadow-xs">
                        <CardHeader className="border-b border-border px-4 py-3 [.border-b]:pb-3">
                            <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                <Plus className="h-3.5 w-3.5 text-primary" aria-hidden />
                                Append New Node
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 p-4">
                            <p className="text-sm text-muted-foreground">
                                Add a new compute node to the existing cluster. The node must be reachable
                                via SSH and running a supported OS.
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                    <Label className="mb-1 block text-xs font-medium text-foreground">Node IP Address</Label>
                                    <Input
                                        value={appendForm.node_ip}
                                        onChange={e => setAppendForm(f => ({ ...f, node_ip: e.target.value }))}
                                        placeholder="172.17.181.150"
                                        className="font-mono text-xs"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <Label className="mb-1 block text-xs font-medium text-foreground">Node Name</Label>
                                    <Input
                                        value={appendForm.node_name}
                                        onChange={e => setAppendForm(f => ({ ...f, node_name: e.target.value }))}
                                        placeholder="worker-node1"
                                    />
                                </div>
                                <div>
                                    <Label className="mb-1 block text-xs font-medium text-foreground">SSH Port</Label>
                                    <Input
                                        value={appendForm.ssh_port}
                                        onChange={e => setAppendForm(f => ({ ...f, ssh_port: e.target.value }))}
                                        placeholder="22"
                                        className="font-mono text-xs"
                                    />
                                </div>
                                <div>
                                    <Label className="mb-1 block text-xs font-medium text-foreground">SSH User</Label>
                                    <Input
                                        value={appendForm.ssh_user}
                                        onChange={e => setAppendForm(f => ({ ...f, ssh_user: e.target.value }))}
                                        placeholder="root"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <Label className="mb-1 block text-xs font-medium text-foreground">SSH Password (optional)</Label>
                                    <Input
                                        type="password"
                                        value={appendForm.ssh_password}
                                        onChange={e => setAppendForm(f => ({ ...f, ssh_password: e.target.value }))}
                                        placeholder="Leave blank to use SSH key"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <Label className="mb-1 block text-xs font-medium text-foreground">Node OS</Label>
                                    <div className="flex gap-2">
                                        {["ubuntu", "windows"].map(os => (
                                            <Button
                                                key={os}
                                                size="sm"
                                                variant={appendForm.node_os === os ? "default" : "outline"}
                                                onClick={() => setAppendForm(f => ({ ...f, node_os: os }))}
                                            >
                                                {os === "ubuntu" ? "Ubuntu" : "Windows"}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <Button
                                onClick={handleRunAppend}
                                disabled={runningSetup || runningAppend || !!pollingTask}
                                className="w-full"
                            >
                                {runningAppend ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running...</>
                                ) : (
                                    <><Plus className="mr-2 h-4 w-4" /> Append Node</>
                                )}
                            </Button>
                        </CardContent>
                    </Card>

                    {selectedTask && (
                        <Card className="rounded-lg border-border shadow-xs">
                            <CardHeader className="border-b border-border px-4 py-3 [.border-b]:pb-3">
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            <Terminal className="h-3.5 w-3.5 text-primary" aria-hidden />
                                            Task Output
                                            <Badge
                                                variant="outline"
                                                className={cn("text-[10px]", STATUS_BADGE[selectedTask.status as keyof typeof STATUS_BADGE] || STATUS_BADGE.unknown)}
                                            >
                                                {STATUS_ICONS[selectedTask.status as keyof typeof STATUS_ICONS] || STATUS_ICONS.unknown}
                                                <span className="ml-1">{selectedTask.status}</span>
                                            </Badge>
                                        </CardTitle>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setLogsExpanded(v => !v)}
                                        >
                                            {logsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                        </Button>
                                    </div>
                                    {selectedTask.return_code !== undefined && selectedTask.return_code !== null && selectedTask.return_code !== 0 && (
                                        <p className="text-[11px] text-destructive font-medium">
                                            Exit code: {selectedTask.return_code} — {selectedTask.message}
                                        </p>
                                    )}
                                    {selectedTask.status === "failed" && !selectedTask.return_code && (
                                        <p className="text-[11px] text-destructive font-medium">{selectedTask.message}</p>
                                    )}
                                </div>
                            </CardHeader>
                            {logsExpanded && taskLogs && (
                                <CardContent className="space-y-3 p-4">
                                    <div>
                                        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                            stdout (last 50KB)
                                        </p>
                                        <Textarea
                                            readOnly
                                            value={taskLogs.stdout || "No output."}
                                            className="font-mono text-[10px] leading-relaxed"
                                            rows={12}
                                        />
                                    </div>
                                    {taskLogs.stderr && (
                                        <div>
                                            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
                                                stderr
                                            </p>
                                            <Textarea
                                                readOnly
                                                value={taskLogs.stderr}
                                                className="font-mono text-[10px] leading-relaxed text-destructive"
                                                rows={6}
                                            />
                                        </div>
                                    )}
                                    {selectedTask.return_code !== undefined && selectedTask.return_code !== null && (
                                        <p className="text-xs text-muted-foreground">
                                            Exit code: <span className="font-mono">{selectedTask.return_code}</span>
                                        </p>
                                    )}
                                </CardContent>
                            )}
                        </Card>
                    )}
                </div>

                <div>
                    <Card className="rounded-lg border-border shadow-xs">
                        <CardHeader className="border-b border-border px-4 py-3 [.border-b]:pb-3">
                            <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                <Clock className="h-3.5 w-3.5 text-primary" aria-hidden />
                                Task History
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {loadingHistory ? (
                                <div className="flex items-center justify-center p-8">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : history.length === 0 ? (
                                <p className="p-4 text-sm text-muted-foreground">No tasks run yet.</p>
                            ) : (
                                <div className="divide-y divide-border">
                                    {history.map(task => (
                                        <button
                                            key={task.task_id}
                                            onClick={() => handleSelectTask(task)}
                                            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate font-mono text-xs font-medium">{task.task_id}</p>
                                                <p className="text-[10px] text-muted-foreground">
                                                    {formatAge(task.started_at)}
                                                </p>
                                            </div>
                                            <Badge
                                                variant="outline"
                                                className={cn(
                                                    "shrink-0 text-[10px]",
                                                    STATUS_BADGE[task.status as keyof typeof STATUS_BADGE] || STATUS_BADGE.unknown
                                                )}
                                            >
                                                {STATUS_ICONS[task.status as keyof typeof STATUS_ICONS] || STATUS_ICONS.unknown}
                                            </Badge>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
