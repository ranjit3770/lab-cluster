import { 
    Terminal, Trash2, Server, Plus, ChevronRight, 
    ShieldCheck, Network, Cpu, Lock, AlertCircle, RefreshCcw, Activity,
    Box, Globe, Zap, Layers, Monitor, Command, ArrowRight, ArrowUpRight,
    Scan, Signal, Database, Orbit, Power, History, Cpu as CpuIcon, Sparkles, Loader2
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
import { Badge } from "@/components/ui/badge";
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
        <div className="flex flex-col gap-12 pb-24 selection:bg-primary/30 h-full animate-in fade-in duration-1000 max-w-[1900px] mx-auto w-full">
            {/* Cinematic Control Header */}
            <header className="page-header px-4 text-center lg:text-left border-b border-white/5 pb-20">
                <div className="flex items-center justify-center lg:justify-start gap-4 text-primary text-[11px] font-black uppercase tracking-[0.6em] mb-8">
                    <Terminal className="h-5 w-5 animate-pulse" />
                    <span className="opacity-60 italic">Control Stratum / Diagnostics Matrix</span>
                </div>
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-12">
                    <div className="space-y-4">
                        <h1 className="page-title text-7xl lg:text-[10rem] font-black uppercase leading-[0.8] tracking-tighter text-white italic">Console</h1>
                        <p className="page-subtitle text-sm font-black uppercase tracking-[0.5em] text-muted-foreground/30 flex items-center justify-center lg:justify-start gap-8 italic font-mono">
                          <span className="flex items-center gap-3">
                            <Orbit className="h-5 w-5 text-primary opacity-60" />
                            Active SSH Interrogation
                          </span>
                          <span className="h-1.5 w-1.5 rounded-full bg-white/5" />
                          <span className="flex items-center gap-3">
                            <ShieldCheck className="h-5 w-5 text-emerald-500 opacity-60" />
                            Administrative root-level access verified
                          </span>
                        </p>
                    </div>
                    
                    <div className="flex items-center gap-10 w-full lg:w-auto bg-[#0a0a0a] p-8 rounded-[4rem] border border-white/5 backdrop-blur-3xl shadow-2xl">
                        <Button 
                            onClick={fetchNodes} 
                            className={cn(
                              "h-20 w-20 bg-white shadow-2xl text-black hover:bg-white/90 rounded-[2rem] transition-all group active:scale-95 border-none",
                              isRefreshing && "animate-spin"
                            )}
                        >
                            <RefreshCcw className="h-8 w-8 group-hover:rotate-180 transition-transform duration-700" />
                        </Button>
                        <Dialog open={isAddingNode} onOpenChange={setIsAddingNode}>
                            <DialogTrigger asChild>
                                <Button className="h-24 bg-white text-black hover:bg-white/90 font-black uppercase text-xs tracking-[0.5em] rounded-[2.5rem] px-12 shadow-2xl active:scale-95 transition-all border-none flex items-center gap-6 group overflow-hidden relative">
                                    <div className="absolute inset-0 bg-primary opacity-0 group-hover:opacity-10 blur-xl transition-opacity animate-pulse" />
                                    <div className="h-12 w-12 bg-black rounded-2xl flex items-center justify-center text-white relative z-10">
                                      <Plus className="h-6 w-6" />
                                    </div>
                                    <span className="relative z-10">Register Endpoint</span>
                                    <ArrowRight className="h-6 w-6 opacity-40 group-hover:translate-x-3 transition-transform" />
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-4xl rounded-[5rem] border border-white/10 shadow-[0_50px_200px_rgba(0,0,0,0.8)] p-0 gap-0 overflow-hidden bg-[#020202] backdrop-blur-[100px] selection:bg-primary/30 animate-in zoom-in-95 duration-700">
                                <DialogHeader className="p-16 lg:p-20 bg-white/[0.01] border-b border-white/5 relative overflow-hidden group/modal">
                                    <div className="absolute top-0 right-0 p-20 opacity-[0.03] pointer-events-none group-hover/modal:rotate-12 transition-transform text-white">
                                        <Network className="h-64 w-64" />
                                    </div>
                                    <div className="absolute inset-0 bg-primary opacity-0 group-hover/modal:opacity-[0.02] blur-[100px] transition-opacity" />
                                    <DialogTitle className="uppercase font-black tracking-tighter text-6xl lg:text-7xl text-white flex flex-col gap-6 italic leading-none relative z-10">
                                        <div className="flex items-center gap-8">
                                          <div className="h-28 w-28 bg-primary rounded-[3rem] text-black shadow-3xl shadow-primary/20 flex items-center justify-center group-hover/modal:scale-110 group-hover/modal:rotate-[360deg] transition-all duration-[2000ms]">
                                              <Server className="h-12 w-12" />
                                          </div>
                                          <span className="text-white">Register <span className="text-primary italic">SSH</span></span>
                                        </div>
                                    </DialogTitle>
                                    <DialogDescription className="text-[12px] font-black uppercase tracking-[0.5em] text-muted-foreground/30 mt-10 italic leading-relaxed relative z-10 border-l-2 border-primary/20 pl-8">
                                        Establish high-fidelity diagnostic tunnel to remote cluster node partition via secured Handshake protocol.
                                    </DialogDescription>
                                </DialogHeader>
                                
                                <div className="p-16 lg:p-20 space-y-16">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                                        <div className="space-y-6 group/input col-span-2">
                                            <Label className="text-[12px] font-black uppercase tracking-[0.5em] text-white opacity-20 ml-8 block group-focus-within/input:text-primary transition-all italic leading-none">Friendly Identity</Label>
                                            <div className="relative">
                                              <Input 
                                                  value={newNode.name} 
                                                  onChange={e => setNewNode({...newNode, name: e.target.value})} 
                                                  placeholder="E.G. MASTER_CONTROL_PLANE" 
                                                  className="h-24 bg-white/[0.03] border-none rounded-[3.5rem] font-black uppercase text-xs tracking-[0.4em] text-white px-12 focus:ring-8 focus:ring-primary/10 transition-all placeholder:text-white/5 italic shadow-inner" 
                                              />
                                              <div className="absolute right-12 top-1/2 -translate-y-1/2 opacity-5">
                                                <Badge className="bg-white/5 border-none text-[8px] font-black tracking-[0.3em] uppercase opacity-20 group-hover:opacity-100 transition-all">Identity_Class_A</Badge>
                                              </div>
                                            </div>
                                        </div>

                                        <div className="space-y-6 group/input">
                                            <Label className="text-[12px] font-black uppercase tracking-[0.5em] text-white opacity-20 ml-8 block group-focus-within/input:text-blue-400 transition-all italic leading-none">IP / FQDN Stratum</Label>
                                            <Input 
                                                value={newNode.ip_address} 
                                                onChange={e => setNewNode({...newNode, ip_address: e.target.value})} 
                                                placeholder="192.168.1.10" 
                                                className="h-24 bg-white/[0.03] border-none rounded-[3.5rem] font-mono font-black text-xs tracking-[0.4em] text-white px-12 focus:ring-8 focus:ring-blue-500/10 transition-all placeholder:text-white/5 italic shadow-inner" 
                                            />
                                        </div>
                                        <div className="space-y-6 group/input">
                                            <Label className="text-[12px] font-black uppercase tracking-[0.5em] text-white opacity-20 ml-8 block group-focus-within/input:text-purple-400 transition-all italic leading-none">SSH Port_ID</Label>
                                            <Input 
                                                type="number" 
                                                value={newNode.ssh_port} 
                                                onChange={e => setNewNode({...newNode, ssh_port: parseInt(e.target.value)})} 
                                                className="h-24 bg-white/[0.03] border-none rounded-[3.5rem] font-mono font-black text-xs tracking-[0.4em] text-white px-12 focus:ring-8 focus:ring-purple-500/10 transition-all italic shadow-inner" 
                                            />
                                        </div>

                                        <div className="space-y-6 group/input">
                                            <Label className="text-[12px] font-black uppercase tracking-[0.5em] text-white opacity-20 ml-8 block group-focus-within/input:text-emerald-400 transition-all italic leading-none">Root Principal</Label>
                                            <Input 
                                                value={newNode.ssh_username} 
                                                onChange={e => setNewNode({...newNode, ssh_username: e.target.value})} 
                                                placeholder="root" 
                                                className="h-24 bg-white/[0.03] border-none rounded-[3.5rem] font-mono font-black text-xs tracking-[0.4em] text-white px-12 focus:ring-8 focus:ring-emerald-500/10 transition-all placeholder:text-white/5 italic shadow-inner" 
                                            />
                                        </div>
                                        <div className="space-y-6 group/input">
                                            <Label className="text-[12px] font-black uppercase tracking-[0.5em] text-white opacity-20 ml-8 block group-focus-within/input:text-rose-400 transition-all italic leading-none">Identity Secret</Label>
                                            <Input 
                                                type="password" 
                                                value={newNode.ssh_password} 
                                                onChange={e => setNewNode({...newNode, ssh_password: e.target.value})} 
                                                placeholder="••••••••" 
                                                className="h-24 bg-white/[0.03] border-none rounded-[3.5rem] font-mono text-xs text-white px-12 focus:ring-8 focus:ring-rose-500/10 transition-all placeholder:text-white/5 shadow-inner" 
                                            />
                                        </div>
                                    </div>

                                    <Button 
                                        onClick={handleTestConnection} 
                                        disabled={testStatus === 'testing' || !newNode.ip_address} 
                                        className={cn(
                                            "w-full h-24 rounded-[3.5rem] uppercase font-black text-[12px] tracking-[0.5em] transition-all border-none shadow-3xl relative overflow-hidden italic group/btn flex items-center justify-center gap-6",
                                            testStatus === 'success' ? "bg-emerald-500 text-white shadow-[0_20px_80px_rgba(16,185,129,0.3)]" : 
                                            testStatus === 'failed' ? "bg-rose-500 text-white shadow-[0_20px_80px_rgba(239,68,68,0.3)]" : "bg-white/[0.03] text-white/40 hover:bg-white/5 hover:text-white"
                                        )}
                                    >
                                        <div className="absolute inset-0 bg-white opacity-0 group-hover/btn:opacity-10 blur-xl transition-opacity" />
                                        {testStatus === 'testing' ? (
                                          <div className="flex items-center gap-6">
                                            <Loader2 className="h-8 w-8 animate-spin" />
                                            Interrogating Link...
                                          </div>
                                        ) : testStatus === 'success' ? (
                                          <div className="flex items-center gap-6 scale-110">
                                            <ShieldCheck className="h-8 w-8" />
                                            Handshake Successful
                                          </div>
                                        ) : testStatus === 'failed' ? (
                                          <div className="flex items-center gap-6">
                                            <Zap className="h-8 w-8 animate-pulse" />
                                            Handshake Declined
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-6 group-hover/btn:gap-10 transition-all">
                                            Establish SSH Handshake
                                            <Signal className="h-6 w-6 animate-pulse" />
                                          </div>
                                        )}
                                    </Button>
                                </div>

                                <DialogFooter className="p-16 lg:p-20 pt-0">
                                    <Button 
                                        onClick={handleAddNode} 
                                        disabled={testStatus !== 'success'} 
                                        className="w-full h-32 bg-white text-black hover:bg-white/90 font-black uppercase tracking-[0.6em] text-sm rounded-[4rem] shadow-[0_50px_150px_rgba(255,255,255,0.05)] active:scale-95 transition-all border-none flex items-center justify-center gap-10 group/activate overflow-hidden relative italic"
                                    >
                                        <div className="absolute inset-0 bg-primary opacity-0 group-hover/activate:opacity-20 blur-xl transition-opacity animate-pulse" />
                                        Activate Identity
                                        <div className="h-14 w-14 bg-black rounded-[1.8rem] flex items-center justify-center text-white scale-0 group-hover/activate:scale-100 transition-all duration-700 group-hover/activate:rotate-12 group-hover/activate:translate-x-3">
                                          <ArrowUpRight className="h-7 w-7" />
                                        </div>
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>
            </header>

            {/* Split Diagnostic Dashboard */}
            <div className="flex-1 min-h-0 flex flex-col xl:flex-row gap-16 px-4 lg:px-0 transition-all duration-1000">
                {/* Registry Navigation Sidebar - High-Fidelity Registry */}
                <aside className="w-full xl:w-[480px] flex flex-col gap-10 shrink-0 order-2 xl:order-1 h-full min-h-[600px] animate-in slide-in-from-left-10 duration-1000">
                    <div className="flex items-center justify-between px-8 bg-[#0a0a0a] p-8 rounded-[3rem] border border-white/5 backdrop-blur-3xl shadow-2xl">
                         <div className="flex items-center gap-6">
                            <div className="h-2 w-10 bg-primary rounded-full shadow-glow" />
                            <h3 className="text-[13px] font-black uppercase tracking-[0.5em] text-white italic">Registry Navigation</h3>
                         </div>
                         <div className="flex items-center gap-4 bg-white/5 px-6 py-3 rounded-2xl border border-white/5 shadow-inner">
                              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-glow animate-pulse" />
                              <span className="text-[12px] font-black text-white tabular-nums tracking-[0.3em] italic">{nodes.length} ENDPOINTS</span>
                         </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto space-y-6 no-scrollbar pr-4 pb-20 max-h-[1000px]">
                        {nodes.map(node => (
                            <div 
                                key={node.id} 
                                onClick={() => setSelectedNodeId(node.id)}
                                className={cn(
                                    "p-10 rounded-[4.5rem] border transition-all duration-1000 cursor-pointer group relative overflow-hidden shadow-2xl active:scale-[0.98]",
                                    selectedNodeId === node.id 
                                        ? "bg-white border-transparent scale-[1.02] -translate-x-4 shadow-[0_50px_100px_rgba(255,255,255,0.05)]" 
                                        : "bg-[#0a0a0a] border-white/5 hover:bg-[#0f1115] hover:border-white/20"
                                )}
                            >
                                <div className="absolute inset-0 bg-primary opacity-0 group-hover:opacity-[0.02] blur-3xl transition-opacity pointer-events-none" />
                                <div className="flex items-center justify-between gap-8 relative z-10">
                                    <div className="flex items-center gap-10 flex-1 min-w-0">
                                        <div className={cn(
                                            "h-24 w-24 rounded-[2.5rem] flex items-center justify-center transition-all duration-1000 shrink-0 shadow-3xl relative overflow-hidden group-hover:rotate-[360deg]",
                                            selectedNodeId === node.id ? "bg-black text-white" : "bg-white/5 text-white/10 border border-white/5"
                                        )}>
                                            <Server className="h-10 w-10 relative z-10" />
                                            {selectedNodeId === node.id && (
                                              <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse" />
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className={cn(
                                              "text-3xl font-black tracking-tighter uppercase truncate mb-2 italic leading-none block",
                                              selectedNodeId === node.id ? "text-black" : "text-white group-hover:text-primary transition-colors"
                                            )}>{node.name}</h4>
                                            <div className="flex flex-wrap items-center gap-5">
                                                <Badge className={cn(
                                                  "px-4 py-1.5 text-[11px] font-mono font-black border-none h-auto rounded-xl shadow-inner",
                                                  selectedNodeId === node.id ? "bg-black text-white" : "bg-white/5 text-muted-foreground/30"
                                                )}>{node.ip_address}</Badge>
                                                <div className="flex items-center gap-3">
                                                    <div className={cn("h-2 w-2 rounded-full shadow-glow", selectedNodeId === node.id ? "bg-emerald-500" : "bg-emerald-500/20 active:bg-emerald-500 transition-colors")} />
                                                    <span className={cn("text-[10px] font-black uppercase tracking-[0.4em] italic leading-none opacity-60", selectedNodeId === node.id ? "text-black/40" : "text-muted-foreground/20")}>SSH_UP</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className={cn(
                                      "flex items-center gap-4 transition-all duration-700",
                                      selectedNodeId === node.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                    )}>
                                         <Button 
                                            size="icon" 
                                            variant="ghost" 
                                            className={cn(
                                              "h-14 w-14 rounded-[1.5rem] transition-all duration-500",
                                              selectedNodeId === node.id ? "text-black/20 hover:text-rose-600 hover:bg-rose-500/10" : "text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10"
                                            )}
                                            onClick={(e) => { e.stopPropagation(); setNodeToDelete(node.id); }}
                                         >
                                             <Trash2 className="h-7 w-7" />
                                         </Button>
                                         <div className={cn(
                                           "h-14 w-14 rounded-[1.5rem] flex items-center justify-center transition-all duration-700",
                                           selectedNodeId === node.id ? "bg-black text-white" : "bg-white/5 text-white/10"
                                         )}>
                                           <ChevronRight className={cn(
                                             "h-8 w-8 transition-transform duration-1000", 
                                             selectedNodeId === node.id ? "rotate-[360deg]" : "-translate-x-3 group-hover:translate-x-0"
                                            )} />
                                         </div>
                                    </div>
                                </div>
                                {selectedNodeId === node.id && (
                                  <div className="absolute -bottom-16 -right-16 p-8 opacity-[0.05] pointer-events-none rotate-[30deg] scale-150">
                                    <Orbit className="h-48 w-48 text-black" />
                                  </div>
                                )}
                            </div>
                        ))}
                        
                        {nodes.length === 0 && (
                            <div className="p-24 text-center bg-[#0a0a0a] rounded-[5rem] border border-dashed border-white/5 mt-10 relative group overflow-hidden shadow-2xl">
                                <Activity className="h-16 w-16 text-muted-foreground/10 mx-auto mb-10 group-hover:scale-110 group-hover:rotate-12 transition-all duration-1000" />
                                <div className="space-y-4">
                                  <p className="text-3xl font-black text-white/10 uppercase tracking-tighter italic leading-tight">Registry_Empty</p>
                                  <p className="text-[12px] font-black text-muted-foreground/5 uppercase tracking-[0.5em] leading-relaxed italic max-w-xs mx-auto">
                                    Awaiting endpoint registration for direct matrix interrogation.
                                  </p>
                                </div>
                                <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity blur-[100px] pointer-events-none" />
                            </div>
                        )}
                    </div>
                </aside>

                {/* Massive Live Diagnostic Console Layer - High-Density Command Space */}
                <div className="flex-1 flex flex-col bg-[#0a0a0a] rounded-[5rem] border border-white/5 shadow-[0_50px_200px_rgba(0,0,0,0.8)] relative overflow-hidden order-1 xl:order-2 h-full min-h-[900px] animate-in slide-in-from-right-10 duration-1000 group/command">
                    <div className="absolute inset-0 opacity-[0.02] pointer-events-none" 
                         style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")', backgroundSize: '200px' }} />
                    <div className="absolute inset-0 bg-white/[0.01] pointer-events-none" />
                    
                    {/* Console Intelligence Header */}
                    <div className="p-12 lg:p-16 border-b border-white/5 flex flex-col md:flex-row items-center justify-between gap-12 relative z-10 bg-[#0a0a0a]/80 backdrop-blur-3xl group-hover/command:border-white/10 transition-all duration-1000">
                        <div className="flex items-center gap-10">
                            <div className="h-28 w-28 bg-[#020202] rounded-[3rem] flex items-center justify-center border border-white/5 shadow-3xl shadow-primary/5 transition-all hover:bg-primary hover:text-black duration-700 group/icon cursor-pointer">
                                <Terminal className="h-14 w-14 text-primary group-hover/icon:text-black transition-colors" />
                            </div>
                            <div className="space-y-4">
                                <div className="flex items-center gap-6">
                                  <h3 className="text-4xl lg:text-5xl font-black text-white uppercase tracking-tighter italic leading-none">Interrogator Core</h3>
                                  <Badge className="bg-emerald-500 text-black border-none text-[11px] font-black uppercase tracking-[0.4em] px-6 py-2 rounded-2xl flex items-center gap-3 italic animate-pulse">
                                    <Signal className="h-4 w-4" />
                                    ACTIVE_LINK
                                  </Badge>
                                </div>
                                <div className="flex flex-wrap items-center gap-6 text-[12px] font-black text-muted-foreground/30 uppercase tracking-[0.4em] italic font-mono leading-none">
                                    <span className="flex items-center gap-3 text-primary opacity-60"><Lock className="h-4 w-4" /> SECURE_SSH_SESSION_V4</span>
                                    {selectedNode && (
                                        <>
                                          <div className="h-1.5 w-1.5 rounded-full bg-white/10" />
                                          <div className="flex items-center gap-4">
                                              <span className="text-white bg-white/5 px-4 py-1.5 rounded-xl border border-white/5 shadow-inner">{selectedNode.name}</span>
                                              <span className="opacity-40">{selectedNode.ip_address}</span>
                                          </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-10 w-full md:w-auto self-end lg:self-center">
                             <div className="text-right hidden xl:block">
                                <p className="text-[12px] font-black text-muted-foreground/20 uppercase tracking-[0.4em] mb-2 italic">Fabric_Metrics_Registry</p>
                                <div className="flex items-center gap-4 justify-end">
                                  <Signal className="h-4 w-4 text-primary animate-pulse shadow-glow" />
                                  <p className="text-[11px] font-black text-white uppercase tracking-[0.4em] tabular-nums italic">STRATUM_X_V4.5.1</p>
                                </div>
                             </div>
                             <div className="h-20 w-px bg-white/5 hidden xl:block" />
                             <div className="flex items-center gap-6 px-10 py-6 bg-white shadow-3xl rounded-[2.5rem] border-none group/admin overflow-hidden relative active:scale-95 transition-all text-black cursor-default">
                                <ShieldCheck className="h-7 w-7 relative z-10" />
                                <span className="text-xs font-black uppercase tracking-[0.4em] relative z-10 italic">ROOT_ACCESS_LEVEL_4</span>
                                <div className="absolute inset-0 bg-primary opacity-0 group-hover/admin:opacity-20 transition-opacity blur-2xl" />
                             </div>
                        </div>
                    </div>

                    {/* Operational Core (Terminal Viewport) - Mission Critical Layer */}
                    <div className="flex-1 p-10 lg:p-16 relative flex flex-col gap-10">
                        <div className="flex-1 bg-[#020202] rounded-[4.5rem] border border-white/5 overflow-hidden relative group/console shadow-[inset_0_0_150px_rgba(0,0,0,0.8)] backdrop-blur-3xl p-6 lg:p-16 flex flex-col group-hover/command:border-white/10 transition-all duration-1000">
                            {/* Window Decorative Controls - Cinematic Touches */}
                            <div className="absolute top-12 right-16 flex gap-6 opacity-20 group-hover/console:opacity-60 transition-all duration-1000 scale-125">
                                <div className="h-3 w-3 rounded-full bg-rose-500 shadow-[0_0_15px_rgba(239,68,68,0.8)]" />
                                <div className="h-3 w-3 rounded-full bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.8)]" />
                                <div className="h-3 w-3 rounded-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.8)]" />
                            </div>
                            
                            {!selectedNodeId ? (
                                <div className="h-full flex flex-col items-center justify-center text-center space-y-12 py-32 px-12 animate-in fade-in duration-1000">
                                    <div className="h-40 w-40 bg-white shadow-3xl rounded-[3.5rem] flex items-center justify-center border-none relative group/warn hover:rotate-[360deg] transition-all duration-[2000ms]">
                                         <AlertCircle className="h-16 w-16 text-black relative z-10" />
                                         <div className="absolute inset-0 bg-primary/20 blur-3xl opacity-0 group-hover/warn:opacity-100 transition-opacity animate-pulse" />
                                    </div>
                                    <div className="space-y-6">
                                      <h4 className="text-5xl lg:text-6xl font-black text-white uppercase tracking-tighter italic leading-none">Access Restricted</h4>
                                      <p className="text-[13px] font-black text-muted-foreground/20 uppercase tracking-[0.6em] leading-relaxed max-w-lg mx-auto italic">
                                        Select an authenticated endpoint from the registry navigation to synchronize the high-fidelity diagnostic terminal stratum.
                                      </p>
                                    </div>
                                    <div className="pt-16 flex items-center gap-16">
                                      <div className="flex flex-col items-center gap-4 group/util transition-all hover:scale-110">
                                        <History className="h-8 w-8 text-white opacity-10 group-hover/util:text-primary transition-all group-hover/util:rotate-12" />
                                        <span className="text-[10px] font-black text-white/5 uppercase tracking-[0.5em] italic group-hover/util:text-white/40 transition-colors">Audit_Log_Logged</span>
                                      </div>
                                      <div className="h-16 w-px bg-white/5" />
                                      <div className="flex flex-col items-center gap-4 group/util transition-all hover:scale-110">
                                        <Scan className="h-8 w-8 text-white opacity-10 group-hover/util:text-primary transition-all group-hover/util:-rotate-12" />
                                        <span className="text-[10px] font-black text-white/5 uppercase tracking-[0.5em] italic group-hover/util:text-white/40 transition-colors">Global_Matrix_Scan</span>
                                      </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full font-mono text-base text-emerald-400 leading-loose selection:bg-emerald-500/20 scrollbar-none overflow-y-auto pr-6 custom-terminal relative">
                                     <div className="absolute inset-x-0 h-40 bg-gradient-to-b from-[#020202] to-transparent top-0 z-10 pointer-events-none opacity-50" />
                                     <DevTerminal nodeId={selectedNodeId} token={token!} />
                                     <div className="absolute inset-x-0 h-40 bg-gradient-to-t from-[#020202] to-transparent bottom-0 z-10 pointer-events-none opacity-50" />
                                </div>
                            )}
                        </div>
                        
                        {/* Terminal Footer Stratum */}
                        <div className="flex items-center justify-between px-12 group-hover/command:translate-y-2 transition-transform duration-1000">
                          <div className="flex items-center gap-8">
                            <div className="flex items-center gap-3">
                              <div className="h-2.5 w-2.5 rounded-full bg-primary shadow-glow animate-pulse" />
                              <span className="text-[11px] font-black text-white/20 uppercase tracking-[0.4em] italic">Interrogation_Stream: ONLINE</span>
                            </div>
                            <div className="h-1 w-1 bg-white/10 rounded-full" />
                            <span className="text-[10px] font-mono text-white/10 uppercase tracking-[0.2em]">TTY_S0_MATRIX_READY</span>
                          </div>
                          <div className="flex items-center gap-6 text-white/5 italic font-black text-[10px] tracking-[0.3em]">
                            <Orbit className="h-4 w-4" />
                            AM_HPC_OS v4.28.1
                          </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Futuristic Revoke Authentication Alert - Catastrophic Modal Design */}
            <AlertDialog open={!!nodeToDelete} onOpenChange={(open) => !open && setNodeToDelete(null)}>
                <AlertDialogContent className="bg-[#020202] rounded-[5rem] border border-white/10 shadow-[0_50px_200px_rgba(239,68,68,0.2)] p-16 lg:p-24 max-w-[700px] animate-in zoom-in-95 duration-700 selection:bg-rose-500/30 overflow-hidden relative">
                    <div className="absolute inset-0 bg-rose-500/[0.02] pointer-events-none" />
                    <div className="absolute -top-32 -right-32 p-32 opacity-10 pointer-events-none rotate-45 text-rose-500">
                      <Zap className="h-80 w-80" />
                    </div>
                    
                    <AlertDialogHeader className="p-0 relative z-10">
                        <div className="h-32 w-32 bg-white shadow-3xl rounded-[3rem] flex items-center justify-center mb-16 border-none relative mx-auto transition-all hover:scale-110 active:scale-90 group/alert">
                            <div className="absolute inset-0 bg-rose-500 opacity-20 blur-3xl rounded-full group-hover/alert:opacity-40 transition-opacity" />
                            <AlertCircle className="h-14 w-14 text-black relative z-10 group-hover:rotate-12 transition-transform" />
                        </div>
                        <AlertDialogTitle className="font-black uppercase tracking-tighter text-6xl lg:text-7xl text-white leading-[0.9] text-center mb-10 italic">
                          Revoke <br /> <span className="text-rose-500">Authentication?</span>
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground/30 font-black text-[15px] leading-relaxed uppercase tracking-[0.2em] text-center px-8 italic border-y border-white/5 py-10 mb-16">
                            The registry entry and all SSH credentials for <span className="text-white bg-white/5 px-4 py-1.5 rounded-xl border border-white/10 mx-2 inline-block shadow-inner">{nodes.find(n => n.id === nodeToDelete)?.name}</span> will be purged from the cluster matrix. Diagnostic link will be severed immediately and irreversibly. // SECTOR_PURGE_CONFIRM
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="p-0 flex flex-col sm:flex-row gap-8 relative z-10 px-8">
                        <AlertDialogCancel className="h-28 flex-1 rounded-[3rem] bg-white/[0.03] text-white border-white/5 hover:bg-white/10 hover:border-white/10 font-black text-xs uppercase tracking-[0.4em] transition-all italic active:scale-95 shadow-inner">Abort Operation</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={confirmDeleteNode}
                            className="h-28 flex-1 rounded-[3rem] bg-white text-black hover:bg-black hover:text-white font-black text-xs uppercase tracking-[0.5em] shadow-3xl active:scale-95 transition-all border-none italic group/purge"
                        >
                            Purge Identity
                            <Trash2 className="h-6 w-6 ml-4 group-hover/purge:rotate-12 group-hover/purge:scale-125 transition-all" />
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            
            <style dangerouslySetInnerHTML={{ __html: `
                .custom-terminal::-webkit-scrollbar {
                  width: 4px;
                }
                .custom-terminal::-webkit-scrollbar-track {
                  background: rgba(255,255,255,0.02);
                  border-radius: 10px;
                }
                .custom-terminal::-webkit-scrollbar-thumb {
                  background: rgba(16,185,129,0.2);
                  border-radius: 10px;
                }
                .custom-terminal::-webkit-scrollbar-thumb:hover {
                  background: rgba(16,185,129,0.4);
                }
            `}} />
        </div>
    );
}
