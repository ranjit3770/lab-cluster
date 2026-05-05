import { useEffect, useState } from "react";
import { 
    Shield, Save, Loader2, Briefcase, 
    Lock, ChevronRight, Activity,
    Settings as SettingsIcon, Terminal, Monitor, Plus, Trash2, Globe,
    Cpu, HardDrive, Clock, Zap, ShieldCheck, Database, Key,
    UserCog, Server, AlertTriangle, RefreshCcw, Command
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { settingsApi } from "@/api/settings";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";
import DeveloperPage from "./DeveloperPage";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from "@/components/ui/dialog";

export default function SettingsPage() {
    const { token } = useAuth();
    const location = useLocation();
    const state = location.state as { openTab?: string, selectedNode?: number } | null;
    const [activeTab, setActiveTab] = useState('general');

    useEffect(() => {
        if (state?.openTab) {
            setActiveTab(state.openTab);
        }
    }, [state]);

    const [loading, setLoading] = useState(false);
    
    // System Config (Specific object)
    const [config, setConfig] = useState({
        slurm_rest_url: '',
        session_timeout_seconds: 3600,
        sync_interval_ms: 10000
    });

    // System Settings (Table based)
    const [systemSettings, setSystemSettings] = useState<any[]>([]);
    const [isMaintenanceOn, setIsMaintenanceOn] = useState(false);
    
    // Whitelist State
    const [showMaintenanceDialog, setShowMaintenanceDialog] = useState(false);
    const [maintenanceIPs, setMaintenanceIPs] = useState<any[]>([]);
    const [newIP, setNewIP] = useState('');
    const [newIPLabel, setNewIPLabel] = useState('');
    
    // Granular Loading
    const [maintenanceLoading, setMaintenanceLoading] = useState(false);
    const [toggleLoading, setToggleLoading] = useState(false);
    const [addIPLoading, setAddIPLoading] = useState(false);
    const [removeIPLoading, setRemoveIPLoading] = useState<number | null>(null);

    useEffect(() => {
        if (token) {
            fetchInitialState();
        }
    }, [token]);

    const fetchInitialState = async () => {
        setLoading(true);
        try {
            await Promise.all([
                fetchConfig(),
                fetchSettings(),
                fetchMaintenanceIPs()
            ]);
        } finally {
            setLoading(false);
        }
    };

    const fetchConfig = async () => {
        try {
            const res = await settingsApi.getConfig(token!);
            setConfig(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchSettings = async () => {
        try {
            const res = await settingsApi.getSystemSettings(token!);
            setSystemSettings(res.data);
            const mMode = res.data.find((s: any) => s.key === "maintenance_mode");
            setIsMaintenanceOn(mMode?.value.toLowerCase() === "true");
        } catch (err) {
            console.error(err);
        }
    };

    const fetchMaintenanceIPs = async () => {
        try {
            const res = await settingsApi.getMaintenanceIPs(token!);
            setMaintenanceIPs(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const handleUpdateConfig = async () => {
        setLoading(true);
        try {
            await settingsApi.updateConfig(token!, config);
            toast.success("Platform configuration synchronized.");
        } catch (err) {
            toast.error("Cluster rejected configuration update.");
            await fetchConfig();
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateSystemSetting = async (key: string, value: string) => {
        try {
            await settingsApi.updateSystemSetting(token!, key, value);
            setSystemSettings(prev => prev.map(s => s.key === key ? { ...s, value } : s));
            toast.success(`${key.replace(/_/g, ' ').toUpperCase()} updated.`);
        } catch (err) {
            toast.error(`Failed to update ${key}.`);
        }
    };

    const toggleMaintenance = async (active: boolean) => {
        if (active) {
            // Turning ON
            setShowMaintenanceDialog(true);
        } else {
            // Turning OFF
            setToggleLoading(true);
            try {
                await settingsApi.updateSystemSetting(token!, "maintenance_mode", "false");
                setIsMaintenanceOn(false);
                setSystemSettings(prev => prev.map(s => s.key === "maintenance_mode" ? { ...s, value: "false" } : s));
                toast.success("✓ Maintenance mode deactivated.");
            } catch (err) {
                toast.error("Failed to deactivate maintenance mode.");
            } finally {
                setToggleLoading(false);
            }
        }
    };

    const handleActivateMaintenance = async () => {
        if (maintenanceIPs.length === 0) {
            toast.error("⚠️ At least one IP must be whitelisted.");
            return;
        }
        setMaintenanceLoading(true);
        try {
            await settingsApi.updateSystemSetting(token!, "maintenance_mode", "true");
            setIsMaintenanceOn(true);
            setSystemSettings(prev => prev.map(s => s.key === "maintenance_mode" ? { ...s, value: "true" } : s));
            setShowMaintenanceDialog(false);
            toast.success("🔒 SYSTEM LOCKED: Protocols Active.");
        } catch (err) {
            toast.error("Failed to activate lock.");
        } finally {
            setMaintenanceLoading(false);
        }
    };

    const addWhitelistedIP = async () => {
        if (!newIP.trim()) return;
        setAddIPLoading(true);
        try {
            await settingsApi.addMaintenanceIP(token!, newIP.trim(), newIPLabel.trim());
            setNewIP('');
            setNewIPLabel('');
            fetchMaintenanceIPs();
            toast.success("IP authorized.");
        } catch (err) {
            toast.error("Failed to add IP.");
        } finally {
            setAddIPLoading(false);
        }
    };

    const removeWhitelistedIP = async (id: number) => {
        setRemoveIPLoading(id);
        try {
            await settingsApi.removeMaintenanceIP(token!, id);
            fetchMaintenanceIPs();
            toast.success("Identity revoked.");
        } catch (err) {
            toast.error("Failed to revoke identity.");
        } finally {
            setRemoveIPLoading(null);
        }
    };

    const getSystemValue = (key: string) => {
        return systemSettings.find(s => s.key === key)?.value || '';
    };

    return (
        <div className="flex flex-col gap-10 pb-10">
            <header className="page-header px-2">
                <div className="flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-[0.2em] mb-2">
                    <Command className="h-3.5 w-3.5" />
                    <span>Control Plane / Orchestrator Config</span>
                </div>
                <div className="flex items-end justify-between gap-8">
                    <div>
                        <h1 className="page-title text-4xl lg:text-5xl uppercase leading-none">Settings</h1>
                        <p className="page-subtitle mt-2">Adjust core system behavior, security protocols, and job arbitration limits.</p>
                    </div>
                </div>
            </header>

            <div className="flex flex-col lg:flex-row gap-8 h-full">
                {/* Nav Sidebar */}
                <aside className="w-full lg:w-72 shrink-0 flex flex-col gap-8">
                    <Card className="bg-white/[0.02] border-white/5 border overflow-hidden p-3 rounded-[2.5rem]">
                      <nav className="flex flex-col gap-1.5">
                          {[
                              { id: 'general', label: 'General', icon: SettingsIcon, description: 'Core system' },
                              { id: 'jobs', label: 'Arbitration', icon: Briefcase, description: 'Slurm limits' },
                              { id: 'developer', label: 'Terminal', icon: Terminal, description: 'Direct access' }
                          ].map((tab) => (activeTab !== 'developer' || tab.id === 'developer' ? (
                              <button
                                  key={tab.id}
                                  onClick={() => setActiveTab(tab.id)}
                                  className={cn(
                                      "w-full text-left p-5 rounded-[1.8rem] transition-all duration-500 group relative overflow-hidden",
                                      activeTab === tab.id 
                                      ? "bg-white text-black shadow-2xl shadow-white/5" 
                                      : "hover:bg-white/5 text-muted-foreground hover:text-white"
                                  )}
                              >
                                  <div className="flex items-center gap-4 relative z-10">
                                      <div className={cn(
                                          "h-10 w-10 rounded-2xl flex items-center justify-center transition-all duration-700",
                                          activeTab === tab.id ? "bg-black text-white shadow-lg" : "bg-white/5 text-muted-foreground group-hover:scale-110"
                                      )}>
                                          <tab.icon className="h-5 w-5" />
                                      </div>
                                      <div>
                                          <p className={cn(
                                              "text-[10px] font-black uppercase tracking-[0.2em] leading-none mb-1",
                                              activeTab === tab.id ? "text-black" : "text-inherit"
                                          )}>{tab.label}</p>
                                          <p className={cn(
                                              "text-[9px] font-bold uppercase tracking-tight opacity-40",
                                              activeTab === tab.id ? "text-black" : "text-inherit"
                                          )}>{tab.description}</p>
                                      </div>
                                  </div>
                              </button>
                          ) : null))}
                      </nav>
                    </Card>

                    {activeTab !== 'developer' && (
                        <Card className="p-8 bg-primary/5 rounded-[2.5rem] border-primary/20 border shadow-2xl relative overflow-hidden group">
                             <div className="absolute -top-10 -right-10 p-4 opacity-10 group-hover:opacity-20 transition-all duration-1000 group-hover:rotate-12 group-hover:scale-125">
                                 <ShieldCheck className="h-32 w-32 text-primary" />
                             </div>
                             <div className="relative z-10">
                               <div className="flex items-center gap-3 mb-4">
                                   <div className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_rgba(20,184,166,0.5)] animate-pulse" />
                                   <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Security Node</span>
                               </div>
                               <h3 className="text-sm font-black uppercase tracking-tight mb-2 text-white">Encrypted Link</h3>
                               <p className="text-[10px] text-muted-foreground leading-relaxed font-bold uppercase italic opacity-60">High-priority configuration parity maintained across all clusters.</p>
                             </div>
                        </Card>
                    )}
                </aside>

                {/* Main Content Area */}
                <main className={cn(
                    "flex-1 bg-white/[0.02] border border-white/5 rounded-[2.5rem] relative overflow-hidden transition-all duration-500",
                    activeTab === 'developer' ? "p-0" : "p-8 lg:p-12"
                )}>
                    {activeTab === 'general' && (
                        <div className="space-y-12 animate-in fade-in zoom-in-95 duration-700 h-full overflow-y-auto no-scrollbar pb-20 selection:bg-primary/30">
                             {/* Maintenance Section */}
                             <section className={cn(
                                 "rounded-[3rem] p-10 border transition-all duration-1000 flex flex-col md:flex-row items-center justify-between gap-10",
                                 isMaintenanceOn ? "bg-amber-500/10 border-amber-500/30 shadow-[0_0_50px_rgba(245,158,11,0.05)]" : "bg-white/[0.03] border-white/5"
                             )}>
                                 <div className="space-y-4">
                                    <div className="flex items-center gap-4">
                                        <div className={cn(
                                            "h-14 w-14 rounded-2xl flex items-center justify-center transition-all duration-1000",
                                            isMaintenanceOn ? "bg-amber-500 text-black shadow-[0_0_20px_rgba(245,158,11,0.3)] scale-110" : "bg-primary text-black"
                                        )}>
                                            <AlertTriangle className="h-6 w-6" />
                                        </div>
                                        <div>
                                          <h2 className="text-2xl font-black text-white uppercase tracking-tight">System Lockout</h2>
                                          <p className={cn(
                                            "text-[10px] font-black uppercase tracking-widest mt-1",
                                            isMaintenanceOn ? "text-amber-500" : "text-primary/50"
                                          )}>Maintenance Mode Control</p>
                                        </div>
                                    </div>
                                    <p className="text-muted-foreground text-sm font-bold uppercase tracking-tight leading-relaxed max-w-md opacity-60">
                                        {isMaintenanceOn 
                                            ? "PROTOCOL ACTIVE: All non-privileged user access is severed. Platform only accessible via whitelisted identities." 
                                            : "PUBLIC STATE: System is fully operational and accepting all authenticated researchers."
                                        }
                                    </p>
                                 </div>
                                 <div className="flex flex-col items-center gap-4 bg-black/40 p-8 rounded-[2rem] border border-white/5 shadow-2xl min-w-[200px]">
                                     <span className={cn(
                                         "text-[11px] font-black uppercase tracking-[0.3em] transition-colors mb-2",
                                         isMaintenanceOn ? "text-amber-500" : "text-primary"
                                     )}>{isMaintenanceOn ? "LOCKDOWN" : "PUBLIC SITE"}</span>
                                     <Switch 
                                        checked={isMaintenanceOn}
                                        onCheckedChange={toggleMaintenance}
                                        disabled={toggleLoading}
                                        className={cn("scale-125 transition-all data-[state=checked]:bg-amber-500")}
                                     />
                                     {toggleLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-2" />}
                                 </div>
                             </section>

                             {/* Config Sections */}
                             <div className="grid gap-12 md:grid-cols-2">
                                <div className="space-y-10">
                                  <div className="flex items-center gap-3 px-2">
                                    <Globe className="h-4 w-4 text-primary" />
                                    <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white">Network Interface</span>
                                  </div>
                                  
                                  <div className="space-y-8 bg-white/[0.03] p-10 rounded-[3rem] border border-white/5">
                                    <div className="space-y-3">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-2">Slurm REST Protocol Endpoint</Label>
                                        <div className="relative group">
                                            <Input 
                                                value={config.slurm_rest_url} 
                                                onChange={e => setConfig({...config, slurm_rest_url: e.target.value})}
                                                className="h-16 bg-white shadow-xl text-black rounded-2xl font-mono text-xs font-black placeholder:opacity-20 border-none transition-all focus:ring-4 focus:ring-primary/10"
                                                placeholder="http://slurm-api:8080"
                                            />
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                              <Badge className="bg-primary/10 text-primary border-primary/20 text-[9px] font-black uppercase">REST</Badge>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-3">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-2">Researcher Session TTL (S)</Label>
                                        <div className="relative group">
                                            <Input 
                                                type="number"
                                                value={config.session_timeout_seconds} 
                                                onChange={e => setConfig({...config, session_timeout_seconds: parseInt(e.target.value)})}
                                                className="h-16 bg-white shadow-xl text-black rounded-2xl font-mono text-2xl font-black border-none"
                                            />
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                              <Clock className="h-6 w-6 text-black/10" />
                                            </div>
                                        </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-10">
                                  <div className="flex items-center gap-3 px-2">
                                    <Activity className="h-4 w-4 text-primary" />
                                    <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white">Heartbeat & Sync</span>
                                  </div>

                                  <div className="space-y-8 bg-white/[0.03] p-10 rounded-[3rem] border border-white/5">
                                    <div className="space-y-3">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-2">Telemetry Interval (MS)</Label>
                                        <div className="relative group">
                                            <Input 
                                                type="number"
                                                value={config.sync_interval_ms} 
                                                onChange={e => setConfig({...config, sync_interval_ms: parseInt(e.target.value)})}
                                                className="h-16 bg-white shadow-xl text-black rounded-2xl font-mono text-2xl font-black border-none"
                                            />
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                              <RefreshCcw className={cn("h-6 w-6 text-black/10", loading && "animate-spin")} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-8 bg-primary/10 rounded-[2.5rem] border border-primary/20 flex flex-col justify-between h-28 relative overflow-hidden group">
                                      <Shield className="absolute -bottom-4 -right-4 h-24 w-24 text-primary/10 group-hover:scale-125 transition-transform" />
                                      <div className="relative z-10 flex items-center justify-between">
                                        <div>
                                          <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">Authorization</p>
                                          <p className="text-[9px] font-bold text-primary/50 uppercase italic">TLS 1.4 Active Network</p>
                                        </div>
                                        <Badge className="bg-primary text-black border-none font-black text-[10px]">VERIFIED</Badge>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                             </div>

                             <Button 
                                onClick={handleUpdateConfig} 
                                disabled={loading}
                                className="w-full h-20 bg-white text-black hover:bg-white/90 rounded-[2rem] shadow-2xl shadow-white/5 active:scale-[0.98] transition-all group mt-6"
                             >
                                {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                                  <div className="flex items-center gap-4">
                                    <Save className="h-6 w-6 group-hover:scale-110 transition-transform" />
                                    <span className="font-black uppercase text-sm tracking-[0.3em]">Commit Platform Protocol</span>
                                  </div>
                                )}
                             </Button>
                        </div>
                    )}

                    {activeTab === 'jobs' && (
                        <div className="space-y-12 animate-in fade-in zoom-in-95 duration-700 h-full overflow-y-auto no-scrollbar pb-20 selection:bg-purple-500/30">
                             <div className="space-y-4">
                                <h2 className="text-3xl font-black text-white uppercase tracking-tight">Resource Arbitration</h2>
                                <p className="text-muted-foreground font-black uppercase text-[10px] tracking-widest opacity-50">Global partition limits and compute workload governance.</p>
                             </div>

                             <div className="grid gap-10 md:grid-cols-2">
                                <div className="space-y-10">
                                  <Card className="bg-white/[0.03] border-white/5 rounded-[3rem] p-10 space-y-10">
                                      <div className="flex items-center gap-4">
                                          <div className="h-14 w-14 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20">
                                              <Cpu className="h-7 w-7 text-primary" />
                                          </div>
                                          <div>
                                            <p className="text-white font-black uppercase text-sm">Logic Core Quota</p>
                                            <p className="text-[9px] font-black text-muted-foreground uppercase opacity-40 italic">Global compute cap</p>
                                          </div>
                                      </div>
                                      
                                      <div className="space-y-8">
                                          <div className="space-y-3">
                                              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-2">Max CPU Cores (Unit)</Label>
                                              <Input 
                                                  defaultValue={getSystemValue('max_job_cpu')} 
                                                  onBlur={(e) => handleUpdateSystemSetting('max_job_cpu', e.target.value)}
                                                  className="h-16 bg-white text-black rounded-2xl font-black text-3xl border-none shadow-xl tabular-nums" 
                                              />
                                          </div>
                                          <div className="space-y-3">
                                              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-2">Job Stack Limit (Concurrent)</Label>
                                              <Input 
                                                  defaultValue={getSystemValue('max_batch_jobs_per_user')} 
                                                  onBlur={(e) => handleUpdateSystemSetting('max_batch_jobs_per_user', e.target.value)}
                                                  className="h-16 bg-white text-black rounded-2xl font-black text-3xl border-none shadow-xl tabular-nums" 
                                              />
                                          </div>
                                      </div>
                                  </Card>

                                  <Card className="bg-white/[0.03] border-white/5 rounded-[3rem] p-10 space-y-10">
                                      <div className="flex items-center gap-4">
                                          <div className="h-14 w-14 bg-purple-500/10 rounded-2xl flex items-center justify-center border border-purple-500/20">
                                              <Clock className="h-7 w-7 text-purple-400" />
                                          </div>
                                          <div>
                                            <p className="text-white font-black uppercase text-sm">Chronos Control</p>
                                            <p className="text-[9px] font-black text-muted-foreground uppercase opacity-40 italic">Walltime thresholds</p>
                                          </div>
                                      </div>
                                      <div className="space-y-3">
                                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-2">Sequence Duration Hard-Cap (H)</Label>
                                          <Input 
                                              defaultValue={getSystemValue('max_job_time_hours')} 
                                              onBlur={(e) => handleUpdateSystemSetting('max_job_time_hours', e.target.value)}
                                              className="h-16 bg-white text-black rounded-2xl font-black text-3xl border-none shadow-xl tabular-nums" 
                                          />
                                      </div>
                                  </Card>
                                </div>

                                <Card className="bg-white/[0.03] border-white/5 rounded-[3rem] p-10 space-y-10 flex flex-col">
                                    <div className="flex items-center gap-4">
                                        <div className="h-14 w-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
                                            <Database className="h-7 w-7 text-emerald-400" />
                                        </div>
                                        <div>
                                          <p className="text-white font-black uppercase text-sm">Memory Partitioning</p>
                                          <p className="text-[9px] font-black text-muted-foreground uppercase opacity-40 italic">Cluster RAM governance</p>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-2">Global Allocation Barrier (GB)</Label>
                                        <Input 
                                            defaultValue={getSystemValue('max_job_mem_gb')} 
                                            onBlur={(e) => handleUpdateSystemSetting('max_job_mem_gb', e.target.value)}
                                            className="h-16 bg-white text-black rounded-2xl font-black text-3xl border-none shadow-xl tabular-nums" 
                                        />
                                    </div>
                                    <div className="mt-auto p-10 bg-white shadow-2xl rounded-[2.5rem] relative overflow-hidden group border-none">
                                         <Activity className="absolute -right-6 -bottom-6 h-32 w-32 text-black/5 group-hover:scale-110 group-hover:rotate-12 transition-all duration-700" />
                                         <div className="relative z-10">
                                           <div className="flex items-center gap-3 mb-4">
                                              <Badge className="bg-black text-white rounded-lg px-2 h-6 font-black text-[9px] uppercase">Slurm_Sched_v2</Badge>
                                           </div>
                                           <p className="text-black font-black uppercase text-sm leading-none mb-3">Dynamic Arbitration</p>
                                           <p className="text-black/40 text-[10px] font-bold leading-relaxed uppercase italic">Resources are dynamically scaled and arbitrated by the SLURM backfill strategy based on active partition load metadata.</p>
                                         </div>
                                    </div>
                                </Card>
                             </div>
                        </div>
                    )}

                    {activeTab === 'developer' && (
                        <div className="h-full animate-in fade-in duration-1000">
                            <DeveloperPage preselectedNodeId={state?.selectedNode} />
                        </div>
                    )}
                </main>
            </div>

            {/* Maintenance Dialog */}
            <Dialog open={showMaintenanceDialog} onOpenChange={(open) => {
                if (!open && !maintenanceLoading) setShowMaintenanceDialog(false);
            }}>
                <DialogContent className="sm:max-w-[550px] bg-[#0f1115] rounded-[3rem] border border-white/10 shadow-2xl p-0 gap-0 overflow-hidden glassmorphism">
                    <DialogHeader className="p-10 pb-6 bg-white/[0.02] border-b border-white/5 relative">
                        <div className="absolute -top-10 -right-10 p-4 opacity-5 pointer-events-none">
                            <Shield className="h-48 w-48 text-amber-500" />
                        </div>
                        <div className="flex items-center gap-5 mb-2 relative z-10">
                          <div className="h-16 w-16 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20">
                            <Key className="h-8 w-8 text-amber-500" />
                          </div>
                          <div>
                            <DialogTitle className="text-2xl font-black uppercase tracking-tight text-white leading-none mb-1">Access Whitelist</DialogTitle>
                            <DialogDescription className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500">Authorized Maintenance Terminals</DialogDescription>
                          </div>
                        </div>
                    </DialogHeader>

                    <div className="p-10 space-y-8">
                        <div className="flex gap-4">
                            <div className="flex-1 space-y-3">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2 opacity-40">IPv4 Endpoint</Label>
                                <Input 
                                    value={newIP}
                                    onChange={e => setNewIP(e.target.value)}
                                    placeholder="192.168.1.100"
                                    className="h-16 bg-white shadow-xl text-black rounded-2xl font-mono text-xs font-black border-none"
                                />
                            </div>
                            <div className="w-1/3 space-y-3">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2 opacity-40">Identity</Label>
                                <Input 
                                    value={newIPLabel}
                                    onChange={e => setNewIPLabel(e.target.value)}
                                    placeholder="ADMIN_WS"
                                    className="h-16 bg-white shadow-xl text-black rounded-2xl font-black text-xs uppercase border-none"
                                />
                            </div>
                            <div className="pt-8">
                                <Button 
                                    onClick={addWhitelistedIP}
                                    disabled={addIPLoading || !newIP}
                                    className="h-16 w-16 bg-white text-black hover:bg-white/90 rounded-2xl shadow-xl shadow-white/5 transition-all"
                                >
                                    {addIPLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Plus className="h-6 w-6" />}
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 ml-2">Registry: {maintenanceIPs.length} Active Nodes</p>
                            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-3 no-scrollbar">
                                {maintenanceIPs.length === 0 ? (
                                  <div className="p-8 border-2 border-dashed border-white/5 rounded-[2rem] flex flex-col items-center gap-4 opacity-20 italic">
                                    <AlertTriangle className="h-8 w-8" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">No terminals authorized. System lock will fail.</p>
                                  </div>
                                ) : maintenanceIPs.map(ip => (
                                    <div key={ip.id} className="flex items-center justify-between p-6 bg-white shadow-xl rounded-[2rem] group hover:scale-[1.02] transition-all">
                                        <div className="flex items-center gap-5">
                                            <div className="h-10 w-10 rounded-xl bg-black flex items-center justify-center text-white group-hover:bg-amber-500 transition-colors">
                                                <Terminal className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <p className="text-[14px] font-mono font-black text-black leading-none mb-1">{ip.ip_address}</p>
                                                <p className="text-[9px] font-black text-black/30 uppercase tracking-widest">{ip.label || 'INTERNAL_TERMINAL'}</p>
                                            </div>
                                        </div>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-10 w-10 text-black/20 hover:text-rose-600 hover:bg-rose-50 rounded-xl"
                                            onClick={() => removeWhitelistedIP(ip.id)}
                                            disabled={removeIPLoading === ip.id}
                                        >
                                            {removeIPLoading === ip.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex gap-4 pt-4">
                            <Button 
                                variant="ghost" 
                                className="flex-1 h-16 rounded-2xl uppercase font-black text-[10px] tracking-widest text-white/40 border border-white/5 hover:bg-white/5"
                                onClick={() => setShowMaintenanceDialog(false)}
                            >
                                Defer Link
                            </Button>
                            <Button 
                                onClick={handleActivateMaintenance}
                                disabled={maintenanceIPs.length === 0 || maintenanceLoading}
                                className="flex-[2] h-16 bg-amber-500 hover:bg-amber-400 text-black rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-2xl shadow-amber-500/20 active:scale-95 transition-all"
                            >
                                {maintenanceLoading ? <Loader2 className="h-6 w-6 animate-spin text-black" /> : "ACTIVATE LOCKDOWN"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}