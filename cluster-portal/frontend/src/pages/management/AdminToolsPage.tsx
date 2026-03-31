import { 
    Terminal, Trash2, Server, Plus, 
    RefreshCcw, Monitor, Edit2, Check, X,
    Globe, Shield, Key, Hash, Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { useState, useEffect } from "react";
import { devNodesApi, type DevNode, type DevNodeCreate } from "@/api/devNodes";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

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
import { Card, CardContent } from "@/components/ui/card";

export default function AdminToolsPage() {
    const { token } = useAuth();
    const navigate = useNavigate();
    
    const [nodes, setNodes] = useState<DevNode[]>([]);
    const [isAddingNode, setIsAddingNode] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [newNode, setNewNode] = useState<DevNodeCreate>({
        name: '', ip_address: '', ssh_port: 22, ssh_username: '', ssh_password: ''
    });
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
        try {
            const res = await devNodesApi.getNodes(token!);
            setNodes(res.data);
        } catch (err) {
            console.error(err);
            toast.error("Failed to load nodes.");
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleUpdateNode = async (id: number, field: string, value: string) => {
        try {
            await devNodesApi.updateNode(token!, id, { [field]: value });
            toast.success("Node metadata updated.");
            fetchNodes();
            setEditingNodeId(null);
        } catch (e) {
            toast.error("Update failed.");
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
                toast.success("SSH connection successful");
            } else {
                setTestStatus('failed');
                toast.error("SSH authentication failed");
            }
        } catch (err) {
            setTestStatus('failed');
            toast.error("Connection failed");
        }
    };

    const handleAddNode = async () => {
        if (testStatus !== 'success') {
            toast.error("Please test the connection first.");
            return;
        }
        try {
            await devNodesApi.addNode(token!, newNode);
            toast.success("Node added successfully.");
            setIsAddingNode(false);
            fetchNodes();
            setNewNode({ name: '', ip_address: '', ssh_port: 22, ssh_username: '', ssh_password: '' });
            setTestStatus('idle');
        } catch (err: any) {
            toast.error(err.response?.data?.detail || "Failed to add node.");
        }
    };

    const confirmDeleteNode = async () => {
        if (!nodeToDelete) return;
        try {
            await devNodesApi.deleteNode(token!, nodeToDelete);
            toast.success("Node deleted successfully.");
            fetchNodes();
            setNodeToDelete(null);
        } catch (err: any) {
             toast.error("Failed to delete node.");
        }
    };

    return (
        <div className="flex flex-col gap-4 pb-4 max-w-[1400px] mx-auto w-full animate-in fade-in slide-in-from-bottom-5 duration-500">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                    <h1 className="text-xl lg:text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                        Node Tools
                    </h1>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5 font-medium italic">
                        <Terminal className="h-3.5 w-3.5 text-black" />
                        Manage nodes and check connections
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button 
                        onClick={fetchNodes} 
                        variant="outline"
                        size="sm"
                        className="h-10 w-10 p-0 rounded-xl bg-white shadow-sm border-gray-100"
                    >
                        <RefreshCcw className={cn("h-4 w-4 text-gray-500", isRefreshing && "animate-spin")} />
                    </Button>
                    <Dialog open={isAddingNode} onOpenChange={setIsAddingNode}>
                        <DialogTrigger asChild>
                            <Button size="sm" className="h-10 px-6 rounded-xl shadow-lg bg-black hover:bg-gray-800 text-white border border-white/10">
                                <Plus className="h-4 w-4 mr-2" />
                                Add Node
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[500px] !bg-white !text-black border-none shadow-[0_50px_100px_rgba(0,0,0,0.1)] overflow-hidden p-0 rounded-3xl">
                            <div className="h-2 bg-black w-full" />
                            <div className="p-8 space-y-6">
                                <DialogHeader>
                                    <DialogTitle className="flex items-center gap-3 text-2xl font-black text-black tracking-tight">
                                        <div className="h-10 w-10 flex items-center justify-center bg-gray-100 rounded-2xl">
                                            <Server className="h-6 w-6 text-black" />
                                        </div>
                                        Add Node
                                    </DialogTitle>
                                    <DialogDescription className="text-gray-500 font-medium text-xs mt-1">
                                        Enter server details to connect.
                                    </DialogDescription>
                                </DialogHeader>
                                
                                <div className="space-y-4">
                                    <div className="group relative">
                                        <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1 mb-1.5 block">Node Name</Label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                                                <Monitor className="h-4 w-4 text-gray-300 transition-colors group-focus-within:text-black" />
                                            </div>
                                            <Input 
                                                value={newNode.name} 
                                                onChange={e => setNewNode({...newNode, name: e.target.value})} 
                                                placeholder="Node Name" 
                                                className="pl-10 h-11 bg-gray-50 border-gray-100 rounded-xl focus:bg-white focus:ring-1 focus:ring-black transition-all text-sm font-semibold"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-12 gap-3">
                                        <div className="col-span-8 group">
                                            <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1 mb-1.5 block">IP Address</Label>
                                            <div className="relative">
                                                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                                                    <Globe className="h-4 w-4 text-gray-300 group-focus-within:text-black" />
                                                </div>
                                                <Input 
                                                    value={newNode.ip_address} 
                                                    onChange={e => setNewNode({...newNode, ip_address: e.target.value})} 
                                                    placeholder="192.168.1.1" 
                                                    className="pl-10 h-11 bg-gray-50 border-gray-100 rounded-xl font-mono text-sm focus:ring-1 focus:ring-black"
                                                />
                                            </div>
                                        </div>
                                        <div className="col-span-4 group">
                                            <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1 mb-1.5 block">Port</Label>
                                            <div className="relative">
                                                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                                                    <Hash className="h-4 w-4 text-gray-300 group-focus-within:text-black" />
                                                </div>
                                                <Input 
                                                    type="number" 
                                                    value={newNode.ssh_port} 
                                                    onChange={e => setNewNode({...newNode, ssh_port: parseInt(e.target.value)})} 
                                                    className="pl-10 h-11 bg-gray-50 border-gray-100 rounded-xl focus:ring-1 focus:ring-black"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="group">
                                            <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1 mb-1.5 block">Username</Label>
                                            <div className="relative">
                                                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                                                    <Shield className="h-4 w-4 text-gray-300 group-focus-within:text-black" />
                                                </div>
                                                <Input 
                                                    value={newNode.ssh_username} 
                                                    onChange={e => setNewNode({...newNode, ssh_username: e.target.value})} 
                                                    placeholder="admin" 
                                                    className="pl-10 h-11 bg-gray-50 border-gray-100 rounded-xl focus:ring-1 focus:ring-black"
                                                />
                                            </div>
                                        </div>
                                        <div className="group">
                                            <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1 mb-1.5 block">Password</Label>
                                            <div className="relative">
                                                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                                                    <Key className="h-4 w-4 text-gray-300 group-focus-within:text-black" />
                                                </div>
                                                <Input 
                                                    type="password" 
                                                    value={newNode.ssh_password} 
                                                    onChange={e => setNewNode({...newNode, ssh_password: e.target.value})} 
                                                    placeholder="••••••••" 
                                                    className="pl-10 h-11 bg-gray-50 border-gray-100 rounded-xl font-mono focus:ring-1 focus:ring-black"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <Button 
                                        onClick={handleTestConnection} 
                                        disabled={testStatus === 'testing' || !newNode.ip_address} 
                                        variant="outline"
                                        className={cn(
                                            "w-full h-12 rounded-xl transition-all border-dashed font-bold uppercase tracking-widest text-[10px]",
                                            testStatus === 'success' ? "border-emerald-200 bg-emerald-50 text-emerald-600 shadow-sm" : 
                                            testStatus === 'failed' ? "border-rose-200 bg-rose-50 text-rose-600" : "hover:border-black hover:bg-gray-50"
                                        )}
                                    >
                                        {testStatus === 'testing' ? <RefreshCcw className="h-3 w-3 mr-2 animate-spin" /> : null}
                                        {testStatus === 'testing' ? "Connecting..." : testStatus === 'success' ? "Connection OK" : testStatus === 'failed' ? "Failed" : "Test Connection"}
                                    </Button>
                                </div>

                                <DialogFooter className="pt-4">
                                    <Button 
                                        onClick={handleAddNode} 
                                        disabled={testStatus !== 'success'} 
                                        className="w-full h-14 rounded-2xl shadow-xl shadow-black/5 bg-black hover:bg-gray-900 text-white text-lg font-black tracking-tight"
                                    >
                                        Add Node
                                    </Button>
                                </DialogFooter>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                 {nodes.map(node => (
                    <Card key={node.id} className="border-none shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group rounded-3xl bg-white overflow-hidden ring-1 ring-gray-100">
                        <CardContent className="p-0">
                            <div className="p-6">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 bg-gray-50 rounded-2xl flex items-center justify-center group-hover:bg-black transition-colors shadow-inner">
                                            <Server className="h-6 w-6 text-gray-400 group-hover:text-white transition-colors" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-1 pt-0.5">
                                                {editingNodeId === node.id ? (
                                                    <div className="flex items-center gap-1">
                                                        <Input 
                                                            autoFocus
                                                            className="h-7 w-36 py-0 text-[11px] font-bold border-black/20 focus-visible:ring-black"
                                                            value={editValue}
                                                            onChange={e => setEditValue(e.target.value)}
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter') handleUpdateNode(node.id, 'name', editValue);
                                                                if (e.key === 'Escape') setEditingNodeId(null);
                                                            }}
                                                        />
                                                        <button onClick={() => handleUpdateNode(node.id, 'name', editValue)} className="text-emerald-500 hover:scale-110 transition-all p-1 bg-emerald-50 rounded-md ml-1"><Check className="h-4 w-4 stroke-[3px]"/></button>
                                                        <button onClick={() => setEditingNodeId(null)} className="text-rose-500 hover:scale-110 transition-all p-1 bg-rose-50 rounded-md"><X className="h-4 w-4 stroke-[3px]"/></button>
                                                    </div>
                                                ) : (
                                                    <div 
                                                        className="group/name flex items-center gap-2 cursor-pointer"
                                                        onClick={() => {
                                                            setEditingNodeId(node.id);
                                                            setEditValue(node.name);
                                                        }}
                                                    >
                                                        <h3 className="text-sm font-black text-gray-900 transition-colors uppercase tracking-tight group-hover/name:text-black">
                                                            {node.name}
                                                        </h3>
                                                        <Edit2 
                                                            className="h-3 w-3 opacity-0 group-hover/name:opacity-100 text-gray-400 hover:text-black transition-all" 
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-muted-foreground font-mono mt-0.5 opacity-60">
                                                {node.ip_address}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Badge className="text-[8px] font-black tracking-widest bg-emerald-50 text-emerald-600 border-none px-2 py-0.5 animate-in fade-in zoom-in">STABLE</Badge>
                                        <Button 
                                            size="sm" 
                                            variant="ghost" 
                                            className="h-8 w-8 p-0 rounded-full text-gray-300 hover:text-rose-500 hover:bg-rose-50"
                                            onClick={() => setNodeToDelete(node.id)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 mb-6">
                                    <div className="p-3 bg-gray-50/50 rounded-2xl border border-gray-100/50">
                                        <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-1">Latency</p>
                                        <p className="text-xs font-black text-gray-600">8.4ms</p>
                                    </div>
                                    <div className="p-3 bg-gray-50/50 rounded-2xl border border-gray-100/50">
                                        <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-1">Tunnel</p>
                                        <p className="text-xs font-black text-gray-600">SSH:{node.ssh_port}</p>
                                    </div>
                                </div>

                                <Button 
                                    className="w-full h-12 rounded-2xl bg-black hover:bg-gray-800 text-white shadow-lg shadow-gray-200 transition-all font-bold tracking-tight text-xs overflow-hidden relative group/btn"
                                    onClick={() => navigate(`/management/admin-tools/diagnostic-console?node=${node.id}`)}
                                >
                                    <div className="absolute inset-0 bg-white/10 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                                    <Monitor className="h-3.5 w-3.5 mr-2" />
                                    Launch Virtual Environment
                                    <ArrowRight className="h-3.5 w-3.5 ml-2 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                 ))}

                 {nodes.length === 0 && (
                    <div className="md:col-span-2 lg:col-span-3 py-20 text-center bg-gray-50/50 rounded-[2.5rem] border-2 border-dashed border-gray-100 flex flex-col items-center">
                        <div className="h-20 w-20 flex items-center justify-center bg-gray-100 rounded-3xl mb-4 group hover:rotate-12 transition-transform">
                            <Server className="h-10 w-10 text-gray-300" />
                        </div>
                        <p className="text-sm font-bold text-gray-600">Cluster Infrastructure Vacuum</p>
                        <p className="text-[10px] text-gray-400 mt-1 uppercase font-black tracking-[0.2em]">Add a diagnostic resource to initiate telemetry</p>
                        <Button variant="outline" className="mt-6 rounded-xl text-xs font-bold px-8 border-gray-200 hover:bg-white" onClick={() => setIsAddingNode(true)}>
                            Initialize First Node
                        </Button>
                    </div>
                 )}
            </div>

            <Dialog open={!!nodeToDelete} onOpenChange={(open) => !open && setNodeToDelete(null)}>
                <DialogContent className="!bg-white !text-black border-none shadow-2xl rounded-3xl p-8 max-w-sm">
                    <DialogHeader className="items-center text-center">
                        <div className="h-16 w-16 bg-rose-50 rounded-2xl flex items-center justify-center mb-4">
                            <Trash2 className="h-8 w-8 text-rose-500" />
                        </div>
                        <DialogTitle className="text-xl font-black text-gray-900">Decommission Node?</DialogTitle>
                        <DialogDescription className="text-gray-500 text-xs mt-2 px-2">
                            Terminating <span className="font-bold text-rose-600">{nodes.find(n => n.id === nodeToDelete)?.name}</span> will prune its history and SSH configurations from the registry.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex flex-col sm:flex-col gap-2 mt-6">
                        <Button variant="ghost" onClick={() => setNodeToDelete(null)} className="rounded-xl font-bold text-gray-400 border-none bg-transparent hover:bg-gray-100">Cancel</Button>
                        <Button variant="destructive" onClick={confirmDeleteNode} className="rounded-xl h-12 shadow-lg shadow-rose-200 font-bold bg-rose-500 hover:bg-rose-600">Delete Node</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

const ArrowRight = ({ className }: { className?: string }) => (
    <svg 
        xmlns="http://www.w3.org/2000/svg" 
        width="24" 
        height="24" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className={className}
    >
        <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
    </svg>
)
