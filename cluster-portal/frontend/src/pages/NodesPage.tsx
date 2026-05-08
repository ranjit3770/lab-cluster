import { useEffect, useState, useRef } from 'react';
import { nodesApi } from '@/api/nodes';
import { devNodesApi, type DevNode } from '@/api/devNodes';
import { useAuth } from '@/context/AuthContext';
import PageLoader from '@/components/PageLoader';
import { ControllerFailureAlert } from '@/components/ControllerFailureAlert';
import { 
    Server, Search, RefreshCcw, Terminal, 
    ShieldCheck, Network, Monitor,
    Cpu, HardDrive,
    ArrowRight,
    Scan
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
                nodesApi.getNodes(token!),
                devNodesApi.getNodes(token!)
            ]);
            setNodes(nodesRes.data);
            setDevNodes(devNodesRes.data);
            setError(null);
        } catch (err: any) {
            console.error("Data Fetch Error:", err);
            setError(err.response?.data?.detail || "Failed to fetch nodes.");
            toast.error("Failed to fetch nodes.");
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
        <div className="flex flex-col gap-3 pb-4 selection:bg-primary/30">
            <header className="page-header flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                    <h1 className="page-title text-xl lg:text-2xl font-bold text-gray-900">Nodes</h1>
                    <p className="page-subtitle text-xs text-muted-foreground mt-1">Compute resources</p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input 
                            placeholder="Search nodes..." 
                            className="pl-9 h-8 bg-white/5 border-white/5 text-xs rounded-md"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <Button 
                        onClick={() => fetchData(true)}
                        size="sm"
                        variant="outline"
                        className={cn("h-8 px-2", refreshing && "animate-spin")}
                    >
                        <RefreshCcw className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </header>

            <Card className="overflow-hidden border-white/5 bg-white/[0.02]">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-white/5">
                                <th className="px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Node Name</th>
                                <th className="px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">IP Address</th>
                                <th className="px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider text-center">CPU</th>
                                <th className="px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider text-center">Memory</th>
                                <th className="px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider text-center hidden sm:table-cell">OS</th>
                                <th className="px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredNodes.map((node) => {
                                const isRegistered = devNodes.find(dn => dn.ip_address === node.ip_address);
                                
                                return (
                                    <tr key={node.id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="px-3 py-2.5">
                                            <div className="flex items-center gap-2.5">
                                                <div className="h-8 w-8 flex items-center justify-center bg-white/5 rounded-md">
                                                    <Server className="h-4 w-4 text-muted-foreground" />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-medium text-gray-900">{node.name}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5 hidden md:table-cell">
                                            <span className="text-xs text-muted-foreground font-mono">{node.ip_address || 'N/A'}</span>
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                            <span className="text-sm font-semibold text-gray-900">{node.cpu_total} cores</span>
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                            <span className="text-sm font-semibold text-gray-900">{Math.round(node.memory_total_mb / 1024)} GB</span>
                                        </td>
                                        <td className="px-3 py-2.5 text-center hidden sm:table-cell">
                                            <span className="text-xs text-muted-foreground">{node.operating_system || 'N/A'}</span>
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <div className={cn(
                                                    "h-2 w-2 rounded-full",
                                                    node.status === 'idle' ? "bg-emerald-500" :
                                                    node.status === 'down' ? "bg-rose-500" : "bg-blue-500 animate-pulse"
                                                )} />
                                                <span className={cn(
                                                    "text-[10px] font-medium uppercase",
                                                    node.status === 'idle' ? "text-emerald-500" :
                                                    node.status === 'down' ? "text-rose-500" : "text-blue-500"
                                                )}>{node.status}</span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Card>

            {auxiliaryNodes.length > 0 && (
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="h-1.5 w-6 bg-blue-500 rounded-full" />
                        <h2 className="text-xs font-medium text-muted-foreground uppercase">Management Nodes</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {auxiliaryNodes.map(node => (
                            <Card key={node.id} className="p-3 border-white/5 bg-white/[0.02] hover:border-white/10 transition-colors">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="h-8 w-8 flex items-center justify-center bg-white/5 rounded-md">
                                            <Monitor className="h-4 w-4 text-blue-400" />
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium text-gray-900">{node.name}</div>
                                            <div className="text-[10px] text-muted-foreground">{node.ip_address}</div>
                                        </div>
                                    </div>
                                    <Button 
                                        size="sm"
                                        variant="outline"
                                        className="h-7"
                                        onClick={() => navigate(`/management/admin-tools/diagnostic-console?node=${node.id}`)}
                                    >
                                        <Terminal className="h-3 w-3" />
                                    </Button>
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
