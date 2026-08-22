import {
    Terminal, Trash2, Server, Plus, ChevronRight,
    ShieldCheck, Lock, AlertCircle, RefreshCcw,
    Signal, Orbit, Zap, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { useState, useEffect } from "react";
import { devNodesApi, type DevNode, type DevNodeCreate } from "@/api/devNodes";
import { DevTerminal } from "@/components/DevTerminal";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card } from "@/components/ui/card";

export default function DeveloperPage({ preselectedNodeId }: { preselectedNodeId?: number }) {
    const { token } = useAuth();

    // Node State
    const [nodes, setNodes] = useState<DevNode[]>([]);
    const [selectedNodeId, setSelectedNodeId] = useState<number | null>(preselectedNodeId || null);

    useEffect(() => {
        if (preselectedNodeId) {
            setSelectedNodeId(preselectedNodeId);
        }
    }, [preselectedNodeId]);
    const [isAddingNode, setIsAddingNode] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [newNode, setNewNode] = useState<DevNodeCreate>({
        name: '', ip_address: '', ssh_port: 22, ssh_username: '', ssh_password: ''
    });
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
    const [nodeToDelete, setNodeToDelete] = useState<number | null>(null);

    useEffect(() => {
        if (token) {
            fetchNodes();
        }
    }, [token]);

    const fetchNodes = async () => {
        setIsRefreshing(true);
        try {
            const res = await devNodesApi.getNodes(token!);
            setNodes(res.data);
            if (res.data.length > 0 && !selectedNodeId) {
                // Keep current selection if valid, else pick first
                if (!res.data.find(n => n.id === selectedNodeId)) {
                    setSelectedNodeId(res.data[0].id);
                }
            }
        } catch (err) {
            console.error(err);
            toast.error("Cluster registry synchronization failed.");
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleTestConnection = async () => {
        setTestStatus('testing');
        try {
            const res = await devNodesApi.testSSH(token!, {
                ip_address: newNode.ip_address,
                port: newNode.ssh_port,
                username: newNode.ssh_username,
                password: newNode.ssh_password || ""
            });
            if (res.data.success) {
                setTestStatus('success');
                toast.success("SSH Handshake Established");
            } else {
                setTestStatus('failed');
                toast.error("SSH Authentication Declined");
            }
        } catch (err) {
            setTestStatus('failed');
            toast.error("Host Unreachable / Connection Refused");
        }
    };

    const handleAddNode = async () => {
        if (testStatus !== 'success') {
            toast.error("Target node must maintain valid handshake before registration.");
            return;
        }
        try {
            await devNodesApi.addNode(token!, newNode);
            toast.success("Identity recognized. Node integrated into registry.");
            setIsAddingNode(false);
            fetchNodes();
            setNewNode({ name: '', ip_address: '', ssh_port: 22, ssh_username: '', ssh_password: '' });
            setTestStatus('idle');
        } catch (err: any) {
            toast.error(err.response?.data?.detail || "Registration failed.");
        }
    };

    const confirmDeleteNode = async () => {
        if (!nodeToDelete) return;
        try {
            await devNodesApi.deleteNode(token!, nodeToDelete);
            toast.success("Node identity purged from cluster registry.");
            fetchNodes();
            if (selectedNodeId === nodeToDelete) {
                setSelectedNodeId(null);
            }
            setNodeToDelete(null);
        } catch (err: any) {
             toast.error("Failed to revoke node identity.");
        }
    };

    const selectedNode = nodes.find(n => n.id === selectedNodeId);

    return (
        <div className="flex h-full flex-col gap-4 pb-2">
            <PageHeader
                title="Console"
                description="SSH endpoints and remote terminals"
                actions={
                    <>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchNodes}
                            disabled={isRefreshing}
                            aria-label="Refresh endpoints"
                        >
                            <RefreshCcw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
                        </Button>
                        <Dialog open={isAddingNode} onOpenChange={setIsAddingNode}>
                            <DialogTrigger asChild>
                                <Button size="sm">
                                    <Plus className="h-3.5 w-3.5" />
                                    Register Endpoint
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="gap-0 overflow-hidden rounded-lg border-border bg-popover p-0 shadow-lg sm:max-w-xl">
                                <DialogHeader className="border-b border-border px-5 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                                            <Server className="h-5 w-5 text-primary" aria-hidden />
                                        </div>
                                        <div>
                                            <DialogTitle className="text-base font-semibold text-foreground">Register SSH</DialogTitle>
                                            <DialogDescription className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                                Establish high-fidelity diagnostic tunnel to remote cluster node partition via secured Handshake protocol.
                                            </DialogDescription>
                                        </div>
                                    </div>
                                </DialogHeader>

                                <div className="space-y-4 px-5 py-5">
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                        <div className="space-y-1.5 sm:col-span-2">
                                            <Label className="text-xs font-medium text-foreground">Friendly Identity</Label>
                                            <Input
                                                value={newNode.name}
                                                onChange={e => setNewNode({...newNode, name: e.target.value})}
                                                placeholder="E.G. MASTER_CONTROL_PLANE"
                                                className="h-9 font-mono text-xs uppercase"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-medium text-foreground">IP / FQDN Stratum</Label>
                                            <Input
                                                value={newNode.ip_address}
                                                onChange={e => setNewNode({...newNode, ip_address: e.target.value})}
                                                placeholder="192.168.1.10"
                                                className="h-9 font-mono text-xs"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-medium text-foreground">SSH Port_ID</Label>
                                            <Input
                                                type="number"
                                                value={newNode.ssh_port}
                                                onChange={e => setNewNode({...newNode, ssh_port: parseInt(e.target.value)})}
                                                className="h-9 font-mono text-sm tabular-nums"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-medium text-foreground">Root Principal</Label>
                                            <Input
                                                value={newNode.ssh_username}
                                                onChange={e => setNewNode({...newNode, ssh_username: e.target.value})}
                                                placeholder="root"
                                                className="h-9 font-mono text-xs"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-medium text-foreground">Identity Secret</Label>
                                            <Input
                                                type="password"
                                                value={newNode.ssh_password}
                                                onChange={e => setNewNode({...newNode, ssh_password: e.target.value})}
                                                placeholder="••••••••"
                                                className="h-9 text-sm"
                                            />
                                        </div>
                                    </div>

                                    <Button
                                        onClick={handleTestConnection}
                                        disabled={testStatus === 'testing' || !newNode.ip_address}
                                        variant={testStatus === 'success' ? 'success' : testStatus === 'failed' ? 'destructive' : 'outline'}
                                        className="w-full"
                                    >
                                        {testStatus === 'testing' ? (
                                          <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Interrogating Link...
                                          </>
                                        ) : testStatus === 'success' ? (
                                          <>
                                            <ShieldCheck className="h-4 w-4" />
                                            Handshake Successful
                                          </>
                                        ) : testStatus === 'failed' ? (
                                          <>
                                            <Zap className="h-4 w-4" />
                                            Handshake Declined
                                          </>
                                        ) : (
                                          <>
                                            Establish SSH Handshake
                                            <Signal className="h-4 w-4" />
                                          </>
                                        )}
                                    </Button>
                                </div>

                                <DialogFooter className="border-t border-border px-5 py-4">
                                    <Button
                                        onClick={handleAddNode}
                                        disabled={testStatus !== 'success'}
                                        className="w-full"
                                    >
                                        Activate Identity
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </>
                }
            />

            {/* Split Diagnostic Dashboard */}
            <div className="flex min-h-0 flex-1 flex-col gap-4 xl:flex-row">
                {/* Registry Navigation Sidebar */}
                <aside className="flex w-full shrink-0 flex-col xl:w-80">
                    <Card className="flex min-h-[320px] flex-1 flex-col overflow-hidden rounded-lg border-border shadow-xs">
                        <div className="flex items-center justify-between border-b border-border px-4 py-3">
                             <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Registry Navigation</h3>
                             <span className="inline-flex items-center gap-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                                  <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                                  {nodes.length} ENDPOINTS
                             </span>
                        </div>

                        <div className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                            {nodes.map(node => (
                                <div
                                    key={node.id}
                                    onClick={() => setSelectedNodeId(node.id)}
                                    className={cn(
                                        "group flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 transition-colors",
                                        selectedNodeId === node.id
                                            ? "border-primary/40 bg-accent"
                                            : "border-border bg-card hover:border-ring/40 hover:bg-accent/40"
                                    )}
                                >
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className={cn(
                                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                                            selectedNodeId === node.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                                        )}>
                                            <Server className="h-4 w-4" aria-hidden />
                                        </div>
                                        <div className="min-w-0">
                                            <p className={cn(
                                              "truncate text-sm font-medium",
                                              selectedNodeId === node.id ? "text-accent-foreground" : "text-foreground"
                                            )}>{node.name}</p>
                                            <div className="mt-0.5 flex items-center gap-2">
                                                <span className="truncate font-mono text-[11px] text-muted-foreground">{node.ip_address}</span>
                                                <span className="inline-flex shrink-0 items-center gap-1">
                                                    <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                                                    <span className="text-[10px] font-medium uppercase tracking-wide text-success">SSH_UP</span>
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className={cn(
                                      "flex shrink-0 items-center gap-1 transition-opacity",
                                      selectedNodeId === node.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                    )}>
                                         <Button
                                            size="icon-sm"
                                            variant="ghost"
                                            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                            onClick={(e) => { e.stopPropagation(); setNodeToDelete(node.id); }}
                                            aria-label={`Delete ${node.name}`}
                                         >
                                             <Trash2 className="h-4 w-4" />
                                         </Button>
                                         <ChevronRight
                                           className={cn(
                                             "h-4 w-4",
                                             selectedNodeId === node.id ? "text-primary" : "text-muted-foreground"
                                           )}
                                           aria-hidden
                                         />
                                    </div>
                                </div>
                            ))}

                            {nodes.length === 0 && (
                                <EmptyState
                                    icon={Server}
                                    title="Registry_Empty"
                                    description="Awaiting endpoint registration for direct matrix interrogation."
                                />
                            )}
                        </div>
                    </Card>
                </aside>

                {/* Live Diagnostic Console */}
                <Card className="flex min-h-[480px] min-w-0 flex-1 flex-col overflow-hidden rounded-lg border-border shadow-xs">
                    {/* Console Header */}
                    <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
                                <Terminal className="h-4 w-4 text-primary" aria-hidden />
                            </div>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="truncate text-sm font-semibold text-foreground">Interrogator Core</h3>
                                  <span className="inline-flex items-center gap-1 rounded-md border border-success/20 bg-success/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-success">
                                    <Signal className="h-3 w-3" aria-hidden />
                                    ACTIVE_LINK
                                  </span>
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                                    <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" aria-hidden /> SECURE_SSH_SESSION_V4</span>
                                    {selectedNode && (
                                        <>
                                          <span className="h-1 w-1 rounded-full bg-muted-foreground/40" aria-hidden />
                                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{selectedNode.name}</span>
                                          <span className="font-mono text-[11px]">{selectedNode.ip_address}</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Traffic light decoration */}
                        <div className="hidden items-center gap-1.5 sm:flex" aria-hidden>
                            <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
                            <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
                            <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
                        </div>

                        <div className="flex items-center gap-4 self-start md:self-auto">
                             <div className="hidden text-right lg:block">
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Fabric_Metrics_Registry</p>
                                <div className="mt-0.5 flex items-center justify-end gap-1.5">
                                  <Signal className="h-3 w-3 text-primary" aria-hidden />
                                  <p className="font-mono text-[11px] tabular-nums text-foreground">STRATUM_X_V4.5.1</p>
                                </div>
                             </div>
                             <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide text-secondary-foreground">
                                <ShieldCheck className="h-3 w-3 text-success" aria-hidden />
                                ROOT_ACCESS_LEVEL_4
                             </span>
                        </div>
                    </div>

                    {/* Terminal Viewport (dark interior preserved) */}
                    <div className="min-h-0 flex-1 p-3">
                        {!selectedNodeId ? (
                            <div className="flex h-full items-center justify-center">
                                <EmptyState
                                    icon={AlertCircle}
                                    title="Access Restricted"
                                    description="Select an authenticated endpoint from the registry navigation to synchronize the high-fidelity diagnostic terminal stratum."
                                />
                            </div>
                        ) : (
                            <DevTerminal nodeId={selectedNodeId} token={token!} />
                        )}
                    </div>

                    {/* Terminal Footer */}
                    <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                          <span className="h-1.5 w-1.5 rounded-full animate-pulse bg-success" aria-hidden />
                          Interrogation_Stream: ONLINE
                        </span>
                        <span className="hidden h-1 w-1 rounded-full bg-muted-foreground/30 sm:block" aria-hidden />
                        <span className="hidden font-mono text-[10px] uppercase text-muted-foreground sm:block">TTY_S0_MATRIX_READY</span>
                      </div>
                      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                        <Orbit className="h-3 w-3" aria-hidden />
                        AM_HPC_OS v4.28.1
                      </span>
                    </div>
                </Card>
            </div>

            {/* Revoke Authentication Alert */}
            <AlertDialog open={!!nodeToDelete} onOpenChange={(open) => !open && setNodeToDelete(null)}>
                <AlertDialogContent className="sm:max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-base font-semibold text-foreground">
                          Revoke Authentication?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-sm leading-relaxed text-muted-foreground">
                            The registry entry and all SSH credentials for <span className="rounded bg-muted px-1 py-0.5 font-mono text-[13px] font-medium text-foreground">{nodes.find(n => n.id === nodeToDelete)?.name}</span> will be purged from the cluster matrix. Diagnostic link will be severed immediately and irreversibly. // SECTOR_PURGE_CONFIRM
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Abort Operation</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDeleteNode}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Purge Identity
                            <Trash2 className="ml-1 h-4 w-4" />
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
