import { useEffect, useState, useRef } from 'react';
import { nodesApi } from '@/api/nodes';
import { devNodesApi, type DevNode } from '@/api/devNodes';
import { useAuth } from '@/context/AuthContext';
import PageLoader from '@/components/PageLoader';
import { ControllerFailureAlert } from '@/components/ControllerFailureAlert';
import {
    Server, Search, RefreshCcw, Terminal,
    Monitor,
    Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface Node {
    id: number;
    name: string;
    ip_address: string;
    status: string;
    operating_system: string;
    cpu_total: number;
    cpu_used: number;
    cores_total: number;
    sockets: number;
    threads_per_core: number;
    cpu_load: number;
    memory_total_mb: number;
    memory_used_mb: number;
    free_memory_mb: number;
    slurm_version: string;
    last_updated: string;
}

export default function NodesPage() {
    const { token } = useAuth();
    const navigate = useNavigate();
    const [nodes, setNodes] = useState<Node[]>([]);
    const [devNodes, setDevNodes] = useState<DevNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const hasFetched = useRef(false);

    const fetchData = async (quiet = false) => {
        if (!quiet) {
            setLoading(true);
            setError(null);
        } else {
            setRefreshing(true);
        }
        
        try {
            const [nodesRes, devNodesRes] = await Promise.all([
                nodesApi.getNodes(token!).catch((err) => {
                    console.error("Slurm compute nodes unavailable:", err);
                    return { data: [] };
                }),
                devNodesApi.getNodes(token!)
            ]);
            setNodes(nodesRes.data || []);
            setDevNodes(devNodesRes.data || []);
            setError(null);
        } catch (err: any) {
            const msg = err.response?.data?.detail || "Failed to fetch node data.";
            console.error("Data Fetch Error:", err);
            setError(msg);
            toast.error(msg);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        if (token && !hasFetched.current) {
            hasFetched.current = true;
            fetchData();
        }
        const tid = setInterval(() => fetchData(true), 30000);
        return () => clearInterval(tid);
    }, [token]);

    const filteredNodes = nodes.filter(node => 
        node.name.toLowerCase().includes(search.toLowerCase()) ||
        (node.ip_address && node.ip_address.toLowerCase().includes(search.toLowerCase()))
    );

    const auxiliaryNodes = devNodes.filter(dn => 
        !nodes.some(n => n.ip_address === dn.ip_address)
    );

    if (error) return (
        <ControllerFailureAlert 
            error={error} 
            onRetry={() => fetchData()} 
        />
    );

    if (loading) return <PageLoader message="Loading nodes..." />;

    return (
        <div className="flex flex-col pb-4">
            <PageHeader
                title="Nodes"
                description={
                    refreshing ? (
                        <span className="inline-flex items-center gap-1.5">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Refreshing...
                        </span>
                    ) : (
                        `${nodes.length} compute nodes · ${auxiliaryNodes.length} management nodes`
                    )
                }
                actions={
                    <>
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                            <Input
                                placeholder="Search nodes..."
                                className="h-8 pl-9 text-xs"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                aria-label="Search nodes"
                            />
                        </div>
                        <Button
                            onClick={() => fetchData(true)}
                            size="sm"
                            variant="outline"
                            disabled={refreshing}
                            className="h-8 px-2"
                            aria-label="Refresh nodes"
                        >
                            <RefreshCcw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
                        </Button>
                    </>
                }
            />

            {nodes.length === 0 && auxiliaryNodes.length === 0 ? (
                <EmptyState
                    icon={Server}
                    title="No nodes found"
                    description="No compute or management nodes are available. Check Slurm controller connectivity."
                />
            ) : (
                <>
                    {nodes.length > 0 && (
                        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="border-b border-border bg-muted/50">
                                            <th className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Node Name</th>
                                            <th className="hidden px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:table-cell">IP Address</th>
                                            <th className="px-3 py-2.5 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">CPU</th>
                                            <th className="px-3 py-2.5 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Memory</th>
                                            <th className="hidden px-3 py-2.5 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:table-cell">OS</th>
                                            <th className="px-3 py-2.5 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {filteredNodes.map((node) => (
                                            <tr key={node.id} className="transition-colors hover:bg-accent/40">
                                                <td className="px-3 py-2.5">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted">
                                                            <Server className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                                                        </div>
                                                        <div>
                                                            <div className="text-sm font-medium text-foreground">{node.name}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="hidden px-3 py-2.5 md:table-cell">
                                                    <span className="font-mono text-xs text-muted-foreground">{node.ip_address || 'N/A'}</span>
                                                </td>
                                                <td className="px-3 py-2.5 text-center">
                                                    <span className="text-sm tabular-nums text-foreground">{node.cpu_total}</span>
                                                </td>
                                                <td className="px-3 py-2.5 text-center">
                                                    <span className="text-sm tabular-nums text-foreground">{Math.round(node.memory_total_mb / 1024)} GB</span>
                                                </td>
                                                <td className="hidden px-3 py-2.5 text-center sm:table-cell">
                                                    <span className="text-xs text-muted-foreground">{node.operating_system || 'N/A'}</span>
                                                </td>
                                                <td className="px-3 py-2.5 text-center">
                                                    <StatusBadge status={node.status} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {auxiliaryNodes.length > 0 && (
                        <section className="mt-6">
                            <h2 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Management Nodes
                                <span className="text-muted-foreground/60">({auxiliaryNodes.length})</span>
                            </h2>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {auxiliaryNodes.map(node => (
                                    <div
                                        key={node.id}
                                        className="flex items-center justify-between rounded-lg border border-border bg-card p-3 shadow-xs transition-colors hover:border-ring/40 hover:bg-accent/40"
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-info/10">
                                                <Monitor className="h-4 w-4 text-info" aria-hidden />
                                            </div>
                                            <div>
                                                <div className="text-sm font-medium text-foreground">{node.name}</div>
                                                <div className="font-mono text-[11px] text-muted-foreground">{node.ip_address}</div>
                                            </div>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 px-2"
                                            onClick={() => navigate(`/management/admin-tools/diagnostic-console?node=${node.id}`)}
                                            aria-label={`Open terminal for ${node.name}`}
                                        >
                                            <Terminal className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </>
            )}
        </div>
    );
}
