import {
    Terminal, Trash2, Server, Plus,
    RefreshCcw, Monitor, Edit2, Check, X,
    Globe, Shield, Key, Hash, ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from '@/context/useAuth'
import { useState, useEffect } from "react";
import { devNodesApi, type DevNode, type DevNodeCreate } from "@/api/devNodes";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import PageLoader from "@/components/PageLoader";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { apiErrorMessage } from "@/api/errors";

type NodeOsFamily = 'auto' | 'ubuntu' | 'windows';

const NODE_OS_OPTIONS: Array<{ value: NodeOsFamily; label: string }> = [
    { value: 'auto', label: 'Auto Detect' },
    { value: 'ubuntu', label: 'Ubuntu' },
    { value: 'windows', label: 'Windows' },
];

const normalizeNodeOsFamily = (value?: string): NodeOsFamily => {
    const normalized = (value || 'auto').trim().toLowerCase();
    if (normalized === 'windows' || normalized === 'win') return 'windows';
    if (normalized === 'ubuntu' || normalized === 'linux') return 'ubuntu';
    return 'auto';
};

const FIELD_LABEL_CLASS = "mb-1.5 block pl-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground";

const FAMILY_ICON_STYLES: Record<NodeOsFamily, string> = {
    auto: 'bg-muted text-muted-foreground',
    ubuntu: 'bg-success/10 text-success',
    windows: 'bg-info/10 text-info',
};

export default function AdminToolsPage() {
    const { token } = useAuth();
    const navigate = useNavigate();

    const [nodes, setNodes] = useState<DevNode[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAddingNode, setIsAddingNode] = useState(false);
    const [isBulkAdding, setIsBulkAdding] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [newNode, setNewNode] = useState<DevNodeCreate>({
        name: '', ip_address: '', ssh_port: 22, ssh_username: '', ssh_password: '', os_family: 'auto'
    });
    const [bulkText, setBulkText] = useState('');
    const [bulkUsername, setBulkUsername] = useState('');
    const [bulkPassword, setBulkPassword] = useState('');
    const [bulkPort, setBulkPort] = useState(22);
    const [bulkTestConnections, setBulkTestConnections] = useState(false);
    const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
    const [nodeToDelete, setNodeToDelete] = useState<number | null>(null);
    const [editingNodeId, setEditingNodeId] = useState<number | null>(null);
    const [editValue, setEditValue] = useState('');

    useEffect(() => {
        if (token) {
            fetchNodes();
        }
    }, [token]);

    const fetchNodes = async () => {
        setIsRefreshing(true);
        setIsLoading(true);
        try {
            const res = await devNodesApi.getNodes(token!);
            setNodes(res.data);
        } catch (err) {
            console.error(err);
            toast.error("Failed to load nodes.");
        } finally {
            setIsRefreshing(false);
            setIsLoading(false);
        }
    };

    const handleUpdateNode = async (id: number, field: string, value: string | number) => {
        try {
            await devNodesApi.updateNode(token!, id, { [field]: value } as Partial<DevNodeCreate>);
            toast.success("Node metadata updated.");
            fetchNodes();
            setEditingNodeId(null);
        } catch {
            toast.error("Update failed.");
        }
    };

    const handleTestConnection = async () => {
        if (newNode.os_family === 'windows') {
            setTestStatus('success');
            toast.success("Windows endpoint will be checked by TCP when saved.");
            return;
        }

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
                toast.success("SSH connection successful");
            } else {
                setTestStatus('failed');
                toast.error("SSH authentication failed");
            }
        } catch {
            setTestStatus('failed');
            toast.error("Connection failed");
        }
    };

    const handleAddNode = async () => {
        if (newNode.os_family !== 'windows' && testStatus !== 'success') {
            toast.error("Please test the connection first.");
            return;
        }
        try {
            await devNodesApi.addNode(token!, newNode);
            toast.success("Node added successfully.");
            setIsAddingNode(false);
            fetchNodes();
            setNewNode({ name: '', ip_address: '', ssh_port: 22, ssh_username: '', ssh_password: '', os_family: 'auto' });
            setTestStatus('idle');
        } catch (err) {
            toast.error(apiErrorMessage(err, "Failed to add node."));
        }
    };

    const parseBulkNodes = (): DevNodeCreate[] | null => {
        const rows = bulkText
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line && !line.startsWith("#"));
        const invalidRows: string[] = [];
        const parsedNodes = rows.map((line, index) => {
            const parts = (line.includes(",") ? line.split(",") : line.split(/\s+/))
                .map(part => part.trim());
            const [name, ipAddress, portValue, usernameValue, passwordValue, osFamilyValue] = parts;
            const sshPort = portValue ? Number(portValue) : bulkPort;
            const sshUsername = usernameValue || bulkUsername.trim();
            const sshPassword = passwordValue ?? bulkPassword;
            const osFamily = normalizeNodeOsFamily(osFamilyValue);

            if (!name || !ipAddress || !sshUsername || !Number.isInteger(sshPort) || sshPort < 1 || sshPort > 65535) {
                invalidRows.push(`Line ${index + 1}`);
            }

            return {
                name: name || "",
                ip_address: ipAddress || "",
                ssh_port: sshPort,
                ssh_username: sshUsername,
                ssh_password: sshPassword || undefined,
                os_family: osFamily,
            };
        });

        if (!rows.length) {
            toast.error("Add at least one node row.");
            return null;
        }

        if (invalidRows.length) {
            toast.error(`${invalidRows.join(", ")} need name, IP, SSH username, and a valid port.`);
            return null;
        }

        return parsedNodes;
    };

    const handleBulkAddNodes = async () => {
        const parsedNodes = parseBulkNodes();
        if (!parsedNodes) return;

        setIsBulkSubmitting(true);
        try {
            const res = await devNodesApi.bulkAddNodes(token!, {
                nodes: parsedNodes,
                test_connections: bulkTestConnections,
            });
            const { created, skipped, failed } = res.data;

            if (created.length) {
                toast.success(`${created.length} node${created.length === 1 ? "" : "s"} added successfully.`);
                setBulkText("");
                setIsBulkAdding(false);
                fetchNodes();
            } else {
                toast.error("No nodes were added.");
            }

            if (skipped.length || failed.length) {
                toast.error(`${skipped.length} skipped, ${failed.length} failed during bulk add.`);
            }
        } catch (err) {
            toast.error(apiErrorMessage(err, "Bulk node add failed."));
        } finally {
            setIsBulkSubmitting(false);
        }
    };

    const confirmDeleteNode = async () => {
        if (!nodeToDelete) return;
        try {
            await devNodesApi.deleteNode(token!, nodeToDelete);
            toast.success("Node deleted successfully.");
            fetchNodes();
            setNodeToDelete(null);
        } catch {
             toast.error("Failed to delete node.");
        }
    };

    if (isLoading) return <PageLoader message="Loading node inventory..." />;

    return (
        <div className="mx-auto flex w-full max-w-[1400px] flex-col pb-4">
            <PageHeader
                title="Node Tools"
                description={
                    <span className="flex items-center gap-1.5">
                        <Terminal className="h-3 w-3" aria-hidden />
                        Manage nodes and check connections
                    </span>
                }
                actions={
                    <>
                        <Button
                            onClick={fetchNodes}
                            variant="ghost"
                            size="icon-sm"
                            disabled={isRefreshing}
                            aria-label="Refresh nodes"
                        >
                            <RefreshCcw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                        </Button>
                        <Dialog open={isBulkAdding} onOpenChange={setIsBulkAdding}>
                            <DialogTrigger asChild>
                                <Button size="sm" variant="outline">
                                    <Plus className="h-3.5 w-3.5" />
                                    Bulk Add
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[720px]">
                                <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2">
                                        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                                            <Server className="h-4 w-4 text-primary" aria-hidden />
                                        </span>
                                        Bulk Add Nodes
                                    </DialogTitle>
                                    <DialogDescription>
                                        Add one node per line using name, IP, optional port, username, password, and OS family.
                                    </DialogDescription>
                                </DialogHeader>

                                <div className="space-y-4">
                                    <div>
                                        <Label className={FIELD_LABEL_CLASS}>Node Rows</Label>
                                        <Textarea
                                            value={bulkText}
                                            onChange={e => setBulkText(e.target.value)}
                                            placeholder={"WORKER_NODE1,172.17.181.143,22,cluster,,ubuntu\nWIN_NODE1,172.17.181.210,3389,Administrator,,windows"}
                                            className="min-h-[180px] font-mono text-xs"
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <div>
                                            <Label className={FIELD_LABEL_CLASS}>Default SSH User</Label>
                                            <Input
                                                value={bulkUsername}
                                                onChange={e => setBulkUsername(e.target.value)}
                                                placeholder="cluster"
                                                className="h-9"
                                            />
                                        </div>
                                        <div>
                                            <Label className={FIELD_LABEL_CLASS}>Default Port</Label>
                                            <Input
                                                type="number"
                                                value={bulkPort}
                                                onChange={e => setBulkPort(Number(e.target.value))}
                                                className="h-9"
                                            />
                                        </div>
                                        <div>
                                            <Label className={FIELD_LABEL_CLASS}>Default Password</Label>
                                            <Input
                                                type="password"
                                                value={bulkPassword}
                                                onChange={e => setBulkPassword(e.target.value)}
                                                placeholder="Optional"
                                                className="h-9 font-mono"
                                            />
                                        </div>
                                    </div>

                                    <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2.5">
                                        <input
                                            type="checkbox"
                                            checked={bulkTestConnections}
                                            onChange={e => setBulkTestConnections(e.target.checked)}
                                            className="h-4 w-4 accent-primary"
                                        />
                                        <span className="text-xs font-medium text-foreground">Test SSH connections before saving</span>
                                    </label>
                                </div>

                                <DialogFooter>
                                    <Button
                                        onClick={handleBulkAddNodes}
                                        disabled={isBulkSubmitting}
                                        className="w-full sm:w-auto"
                                    >
                                        {isBulkSubmitting ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                        Add Nodes
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                        <Dialog open={isAddingNode} onOpenChange={setIsAddingNode}>
                            <DialogTrigger asChild>
                                <Button size="sm">
                                    <Plus className="h-3.5 w-3.5" />
                                    Add Node
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[500px]">
                                <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2">
                                        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                                            <Server className="h-4 w-4 text-primary" aria-hidden />
                                        </span>
                                        Add Node
                                    </DialogTitle>
                                    <DialogDescription>
                                        Enter server details to connect.
                                    </DialogDescription>
                                </DialogHeader>

                                <div className="space-y-4">
                                    <div className="group">
                                        <Label className={FIELD_LABEL_CLASS}>Node Name</Label>
                                        <div className="relative">
                                            <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                                                <Monitor className="h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-foreground" />
                                            </div>
                                            <Input
                                                value={newNode.name}
                                                onChange={e => setNewNode({...newNode, name: e.target.value})}
                                                placeholder="Node Name"
                                                className="pl-9 h-9"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-12 gap-3">
                                        <div className="col-span-8 group">
                                            <Label className={FIELD_LABEL_CLASS}>IP Address</Label>
                                            <div className="relative">
                                                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                                                    <Globe className="h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-foreground" />
                                                </div>
                                                <Input
                                                    value={newNode.ip_address}
                                                    onChange={e => setNewNode({...newNode, ip_address: e.target.value})}
                                                    placeholder="192.168.1.1"
                                                    className="pl-9 h-9 font-mono"
                                                />
                                            </div>
                                        </div>
                                        <div className="col-span-4 group">
                                            <Label className={FIELD_LABEL_CLASS}>Port</Label>
                                            <div className="relative">
                                                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                                                    <Hash className="h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-foreground" />
                                                </div>
                                                <Input
                                                    type="number"
                                                    value={newNode.ssh_port}
                                                    onChange={e => setNewNode({...newNode, ssh_port: parseInt(e.target.value)})}
                                                    className="pl-9 h-9"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <Label className={FIELD_LABEL_CLASS}>OS Family</Label>
                                        <select
                                            value={newNode.os_family || 'auto'}
                                            onChange={e => {
                                                setNewNode({...newNode, os_family: e.target.value as NodeOsFamily});
                                                setTestStatus('idle');
                                            }}
                                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            {NODE_OS_OPTIONS.map(option => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="group">
                                            <Label className={FIELD_LABEL_CLASS}>Username</Label>
                                            <div className="relative">
                                                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                                                    <Shield className="h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-foreground" />
                                                </div>
                                                <Input
                                                    value={newNode.ssh_username}
                                                    onChange={e => setNewNode({...newNode, ssh_username: e.target.value})}
                                                    placeholder="admin"
                                                    className="pl-9 h-9"
                                                />
                                            </div>
                                        </div>
                                        <div className="group">
                                            <Label className={FIELD_LABEL_CLASS}>Password</Label>
                                            <div className="relative">
                                                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                                                    <Key className="h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-foreground" />
                                                </div>
                                                <Input
                                                    type="password"
                                                    value={newNode.ssh_password}
                                                    onChange={e => setNewNode({...newNode, ssh_password: e.target.value})}
                                                    placeholder="••••••••"
                                                    className="pl-9 h-9 font-mono"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <Button
                                        onClick={handleTestConnection}
                                        disabled={testStatus === 'testing' || !newNode.ip_address}
                                        variant="outline"
                                        className={cn(
                                            "w-full font-semibold uppercase tracking-wide text-[11px]",
                                            testStatus === 'success' ? "border-success/30 bg-success/10 text-success hover:bg-success/20 hover:text-success" :
                                            testStatus === 'failed' ? "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive" : ""
                                        )}
                                    >
                                        {testStatus === 'testing' ? <RefreshCcw className="h-3.5 w-3.5 animate-spin" /> : null}
                                        {testStatus === 'testing' ? "Connecting..." : testStatus === 'success' ? "Connection OK" : testStatus === 'failed' ? "Failed" : newNode.os_family === 'windows' ? "Mark Windows Endpoint" : "Test Connection"}
                                    </Button>
                                </div>

                                <DialogFooter>
                                    <Button
                                        onClick={handleAddNode}
                                        disabled={newNode.os_family !== 'windows' && testStatus !== 'success'}
                                        className="w-full sm:w-auto"
                                    >
                                        Add Node
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </>
                }
            />

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                 {nodes.map(node => {
                    const family = normalizeNodeOsFamily(node.os_family);
                    return (
                        <div
                            key={node.id}
                            className="group flex flex-col rounded-lg border border-border bg-card p-4 shadow-xs transition-colors hover:border-ring/40"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex min-w-0 items-start gap-3">
                                    <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors", FAMILY_ICON_STYLES[family])}>
                                        <Server className="h-4 w-4" aria-hidden />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1 pt-0.5">
                                            {editingNodeId === node.id ? (
                                                <div className="flex items-center gap-1">
                                                    <Input
                                                        autoFocus
                                                        className="h-7 w-36 py-0 text-xs font-medium"
                                                        value={editValue}
                                                        onChange={e => setEditValue(e.target.value)}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') handleUpdateNode(node.id, 'name', editValue);
                                                            if (e.key === 'Escape') setEditingNodeId(null);
                                                        }}
                                                    />
                                                    <button onClick={() => handleUpdateNode(node.id, 'name', editValue)} className="rounded-md p-1 text-success transition-colors hover:bg-success/10" aria-label="Save name"><Check className="h-3.5 w-3.5" /></button>
                                                    <button onClick={() => setEditingNodeId(null)} className="rounded-md p-1 text-destructive transition-colors hover:bg-destructive/10" aria-label="Cancel rename"><X className="h-3.5 w-3.5" /></button>
                                                </div>
                                            ) : (
                                                <div
                                                    className="group/name flex cursor-pointer items-center gap-1.5"
                                                    onClick={() => {
                                                        setEditingNodeId(node.id);
                                                        setEditValue(node.name);
                                                    }}
                                                >
                                                    <h3 className="truncate text-sm font-semibold text-foreground transition-colors group-hover/name:text-primary">
                                                        {node.name}
                                                    </h3>
                                                    <Edit2
                                                        className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/name:opacity-100"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                                            {node.ip_address}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                    <select
                                        value={node.os_family || 'auto'}
                                        onChange={e => handleUpdateNode(node.id, 'os_family', e.target.value)}
                                        className="h-7 rounded-md border border-input bg-background px-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground shadow-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        title="OS family"
                                    >
                                        {NODE_OS_OPTIONS.map(option => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                    <Badge variant="outline" className="border-success/20 bg-success/10 text-success">STABLE</Badge>
                                    <Button
                                        size="icon-sm"
                                        variant="ghost"
                                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                        onClick={() => setNodeToDelete(node.id)}
                                        aria-label={`Delete ${node.name}`}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-2">
                                <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Latency</p>
                                    <p className="mt-0.5 text-xs font-semibold tabular-nums text-foreground">8.4ms</p>
                                </div>
                                <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Access</p>
                                    <span className="mt-0.5 inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground">
                                        {node.os_family === 'windows' && node.ssh_port === 3389 ? 'RDP' : 'SSH'}:{node.ssh_port}
                                    </span>
                                </div>
                            </div>

                            <Button
                                className="mt-4 w-full"
                                onClick={() => navigate(`/management/admin-tools/diagnostic-console?node=${node.id}`)}
                            >
                                <Monitor className="h-3.5 w-3.5" />
                                Launch Virtual Environment
                                <ArrowRight className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                            </Button>
                        </div>
                    );
                 })}

                 {nodes.length === 0 && !isLoading && (
                    <div className="md:col-span-2 lg:col-span-3">
                        <EmptyState
                            icon={Server}
                            title="Cluster Infrastructure Vacuum"
                            description="Add a diagnostic resource to initiate telemetry"
                            action={
                                <Button variant="outline" size="sm" onClick={() => setIsAddingNode(true)}>
                                    Initialize First Node
                                </Button>
                            }
                        />
                    </div>
                 )}
            </div>

            <Dialog open={!!nodeToDelete} onOpenChange={(open) => !open && setNodeToDelete(null)}>
                <DialogContent className="max-w-sm">
                    <DialogHeader className="items-center text-center">
                        <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                            <Trash2 className="h-6 w-6 text-destructive" />
                        </div>
                        <DialogTitle>Decommission Node?</DialogTitle>
                        <DialogDescription>
                            Terminating <span className="font-semibold text-destructive">{nodes.find(n => n.id === nodeToDelete)?.name}</span> will prune its history and SSH configurations from the registry.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex-col gap-2 sm:flex-col">
                        <Button variant="ghost" onClick={() => setNodeToDelete(null)} className="text-muted-foreground">Cancel</Button>
                        <Button variant="destructive" onClick={confirmDeleteNode}>Delete Node</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
