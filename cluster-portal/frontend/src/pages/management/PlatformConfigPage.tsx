import { useEffect, useState } from "react";
import { 
    Shield, Save, Loader2, Settings as SettingsIcon, 
    Globe, Clock, Lock, Terminal, Plus, Trash2, Network,
    Server, Info, UserCheck, Hash, AlertCircle,
    Zap, Activity, Database, Orbit, Power, History,
    Cpu, Scan, Signal, LayoutGrid, Monitor, Command,
    ArrowRight, ArrowUpRight, CheckCircle2, XCircle, ShieldAlert
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { settingsApi } from "@/api/settings";
import { cn } from "@/lib/utils";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";

export default function PlatformConfigPage() {
    const { token, user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [config, setConfig] = useState<any>({
        slurm_rest_url: '',
        slurm_node_api: '',
        external_job_api_url: '',
        slurm_version: '',
        slurm_user: '',
        slurm_jwt_user: '',
        slurm_path: '',
        slurm_lib_path: '',
        cluster_name: '',
        cluster_description: '',
        session_timeout_seconds: 3600,
        sync_interval_ms: 60000,
        max_batch_jobs_per_user: 10,
        max_jupyter_jobs_per_user: 2
    });
    const [isMaintenanceOn, setIsMaintenanceOn] = useState(false);
    const [maintenanceIPs, setMaintenanceIPs] = useState<any[]>([]);
    const [showMaintenanceDialog, setShowMaintenanceDialog] = useState(false);
    const [newIP, setNewIP] = useState('');
    const [toggleLoading, setToggleLoading] = useState(false);
    const [maintenanceLoading, setMaintenanceLoading] = useState(false);
    const [addIPLoading, setAddIPLoading] = useState(false);
    const [integrityLoading, setIntegrityLoading] = useState(false);
    const [integrityData, setIntegrityData] = useState<any>(null);

    useEffect(() => {
        if (token) {
            fetchInitialState();
        }
    }, [token]);

    const fetchInitialState = async () => {
        setLoading(true);
        try {
            const [cfgRes, settingsRes, ipRes] = await Promise.all([
                settingsApi.getConfig(token!),
                settingsApi.getSystemSettings(token!),
                settingsApi.getMaintenanceIPs(token!)
            ]);
            setConfig({
                ...cfgRes.data,
                sync_interval_ms: cfgRes.data.sync_interval_ms || 60000
            });
            const mMode = settingsRes.data.find((s: any) => s.key === "maintenance_mode");
            setIsMaintenanceOn(mMode?.value.toLowerCase() === "true");
            setMaintenanceIPs(ipRes.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateConfig = async () => {
        setLoading(true);
        try {
            await settingsApi.updateConfig(token!, config);
            window.dispatchEvent(new CustomEvent('branding-update'));
            toast.success("Configuration updated.");
        } catch (err) {
            toast.error("Failed to update config.");
        } finally {
            setLoading(false);
        }
    };

    const toggleMaintenance = async (active: boolean) => {
        if (active) {
            setShowMaintenanceDialog(true);
        } else {
            setToggleLoading(true);
            try {
                await settingsApi.updateSystemSetting(token!, "maintenance_mode", "false");
                setIsMaintenanceOn(false);
                toast.success("Maintenance mode deactivated.");
            } catch (err) {
                toast.error("Failed to deactivate maintenance mode.");
            } finally {
                setToggleLoading(false);
            }
        }
    };

    const handleActivateMaintenance = async () => {
        if (maintenanceIPs.length === 0) {
            toast.error("At least one IP must be whitelisted.");
            return;
        }
        setMaintenanceLoading(true);
        try {
            await settingsApi.updateSystemSetting(token!, "maintenance_mode", "true");
            setIsMaintenanceOn(true);
            setShowMaintenanceDialog(false);
            toast.success("Maintenance mode activated.");
        } catch (err) {
            toast.error("Failed to activate maintenance mode.");
        } finally {
            setMaintenanceLoading(false);
        }
    };

    const runIntegrityCheck = async () => {
        setIntegrityLoading(true);
        try {
            const res = await settingsApi.getIntegrity(token!);
            setIntegrityData(res.data);
            toast.success("Integrity check complete.");
        } catch (err) {
            toast.error("Integrity check failed.");
        } finally {
            setIntegrityLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-4 pb-4 max-w-[1200px] mx-auto w-full animate-in fade-in duration-300">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-4 rounded-xl border border-gray-100 shadow-sm mb-4">
                <div>
                    <h1 className="text-xl lg:text-2xl font-bold text-gray-900 tracking-tight">System Configuration</h1>
                    <p className="text-xs text-gray-500 mt-0.5">Manage cluster settings and connection details</p>
                </div>
            </header>

            {/* Persistent Control Bar */}
            <div className="fixed bottom-6 right-6 z-[100] pointer-events-none">
                <div className="pointer-events-auto">
                    <Button 
                        onClick={handleUpdateConfig} 
                        disabled={loading} 
                        size="lg"
                        className="h-14 px-8 rounded-full shadow-2xl bg-black hover:bg-gray-800 text-white font-bold text-base flex items-center gap-2 border border-white/20"
                    >
                        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                        Save Configuration
                    </Button>
                </div>
            </div>

            {user?.role === 'developer' && (
                <Card className={cn(
                    "border-none transition-all duration-500 overflow-hidden relative shadow-2xl",
                    isMaintenanceOn 
                        ? "bg-white border-2 border-amber-600 shadow-[0_30px_60px_-15px_rgba(245,158,11,0.4)]" 
                        : "bg-white border border-gray-200 shadow-sm"
                )}>
                    {isMaintenanceOn && (
                        <div className="absolute top-0 right-0 p-1">
                            <Badge className="bg-amber-100 text-amber-700 border border-amber-200 text-[9px] font-black animate-pulse uppercase tracking-widest">System Restricted</Badge>
                        </div>
                    )}
                    <CardContent className="p-6 flex items-center justify-between relative z-10 bg-white">
                        <div className="flex items-center gap-5">
                            <div className={cn(
                                "h-14 w-14 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-xl",
                                isMaintenanceOn 
                                    ? "bg-amber-600 text-white shadow-amber-600/20 rotate-12" 
                                    : "bg-emerald-600 text-white shadow-emerald-600/10"
                            )}>
                                {isMaintenanceOn ? <Lock className="h-7 w-7" /> : <Power className="h-7 w-7" />}
                            </div>
                            <div>
                                <h3 className={cn(
                                    "text-lg font-bold tracking-tight mb-1",
                                    isMaintenanceOn ? "text-amber-700" : "text-gray-900"
                                )}>
                                    System Maintenance Mode
                                </h3>
                                <div className="flex items-center gap-2">
                                    <div className={cn(
                                        "h-2 w-2 rounded-full", 
                                        isMaintenanceOn ? "bg-amber-600 animate-ping" : "bg-emerald-600"
                                    )} />
                                    <p className={cn(
                                        "text-xs font-bold uppercase tracking-[0.1em]",
                                        isMaintenanceOn ? "text-amber-600" : "text-emerald-700"
                                    )}>
                                        {isMaintenanceOn ? "Restricted Access Protocol" : "Public Operational State"}
                                    </p>
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex flex-col items-center gap-3">
                            <div className="flex items-center gap-3">
                                {toggleLoading && <Loader2 className="h-5 w-5 animate-spin text-gray-400" />}
                                <div className="flex flex-col items-end gap-1">
                                    <Label className={cn("text-[9px] font-black uppercase tracking-widest", isMaintenanceOn ? "text-amber-600/50" : "text-gray-400")}>
                                        {isMaintenanceOn ? "Deactivate" : "Activate"}
                                    </Label>
                                    <Switch 
                                        checked={isMaintenanceOn}
                                        onCheckedChange={toggleMaintenance}
                                        disabled={toggleLoading}
                                        className={cn(
                                            "scale-125 transition-all outline-none ring-offset-background",
                                            "data-[state=checked]:bg-amber-600 data-[state=unchecked]:bg-gray-200",
                                            isMaintenanceOn && "shadow-[0_0_20px_rgba(245,158,11,0.3)]"
                                        )}
                                    />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                    
                    {isMaintenanceOn && (
                        <div className="px-6 py-2 bg-amber-50 border-t border-amber-100 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-[10px] text-amber-700 font-bold">
                                <Info className="h-3 w-3" />
                                <span>External Job Submissions are currently rejected for all non-whitelisted IPs.</span>
                            </div>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setShowMaintenanceDialog(true)}
                                className="h-6 text-[10px] text-amber-600 hover:bg-amber-100 hover:text-amber-700 font-bold uppercase"
                            >
                                Manage Protocol Whitelist
                            </Button>
                        </div>
                    )}
                </Card>
            )}

            <Card className="bg-white border-gray-200 shadow-sm">
                <CardHeader className="p-4 pb-2">
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <Info className="h-4 w-4" />
                        Cluster Info
                    </h3>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <Label className="text-[10px] font-medium text-gray-500 uppercase">Cluster Name</Label>
                            <Input 
                                value={config.cluster_name} 
                                onChange={e => setConfig({...config, cluster_name: e.target.value})}
                                className="h-10 mt-1 bg-white"
                                placeholder="Cluster Name"
                            />
                        </div>
                        <div>
                            <Label className="text-[10px] font-medium text-gray-500 uppercase">Description</Label>
                            <Input 
                                value={config.cluster_description} 
                                onChange={e => setConfig({...config, cluster_description: e.target.value})}
                                className="h-10 mt-1 bg-white"
                                placeholder="Short description"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-white border-gray-200 shadow-sm">
                <CardHeader className="p-4 pb-2">
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Update Speeds
                    </h3>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="text-[10px] font-medium text-gray-500 uppercase">Session length (seconds)</Label>
                            <Input 
                                type="number"
                                value={config.session_timeout_seconds} 
                                onChange={e => setConfig({...config, session_timeout_seconds: parseInt(e.target.value)})}
                                className="h-10 mt-1 bg-white"
                            />
                        </div>
                        <div>
                            <Label className="text-[10px] font-medium text-gray-500 uppercase">Sync Speed (ms)</Label>
                            <Input 
                                type="number"
                                value={config.sync_interval_ms} 
                                onChange={e => setConfig({...config, sync_interval_ms: parseInt(e.target.value)})}
                                className="h-10 mt-1 bg-white"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-white border-gray-200 shadow-sm">
                <CardHeader className="p-4 pb-2">
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <Terminal className="h-4 w-4" />
                        Slurm Connection
                    </h3>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <Label className="text-[10px] font-medium text-gray-500 uppercase">REST API URL</Label>
                            <Input 
                                value={config.slurm_rest_url} 
                                onChange={e => setConfig({...config, slurm_rest_url: e.target.value})}
                                className="h-10 mt-1 font-mono bg-white"
                                placeholder="http://..."
                            />
                        </div>
                        <div>
                            <Label className="text-[10px] font-medium text-gray-500 uppercase">Node API URL</Label>
                            <Input 
                                value={config.slurm_node_api} 
                                onChange={e => setConfig({...config, slurm_node_api: e.target.value})}
                                className="h-10 mt-1 font-mono bg-white"
                                placeholder="http://..."
                            />
                        </div>
                        <div>
                            <Label className="text-[10px] font-medium text-gray-500 uppercase">Job API URL</Label>
                            <Input 
                                value={config.external_job_api_url} 
                                onChange={e => setConfig({...config, external_job_api_url: e.target.value})}
                                className="h-10 mt-1 font-mono bg-white"
                                placeholder="http://..."
                            />
                        </div>
                        <div>
                            <Label className="text-[10px] font-medium text-gray-500 uppercase">Slurm Version</Label>
                            <Input 
                                value={config.slurm_version} 
                                onChange={e => setConfig({...config, slurm_version: e.target.value})}
                                className="h-10 mt-1 bg-white"
                                placeholder="v0.0.41"
                            />
                        </div>
                        <div>
                            <Label className="text-[10px] font-medium text-gray-500 uppercase">JWT User (Slurmrestd)</Label>
                            <Input 
                                value={config.slurm_jwt_user} 
                                onChange={e => setConfig({...config, slurm_jwt_user: e.target.value})}
                                className="h-10 mt-1 bg-white font-mono"
                                placeholder="slurmrestd"
                            />
                        </div>
                        <div>
                            <Label className="text-[10px] font-medium text-gray-500 uppercase">Slurm Path (Bin/Sbin)</Label>
                            <Input 
                                value={config.slurm_path} 
                                onChange={e => setConfig({...config, slurm_path: e.target.value})}
                                className="h-10 mt-1 bg-white font-mono"
                                placeholder="/usr/local/slurm/bin..."
                            />
                        </div>
                        <div>
                            <Label className="text-[10px] font-medium text-gray-500 uppercase">Slurm Lib Path (LD_LIBRARY_PATH)</Label>
                            <Input 
                                value={config.slurm_lib_path} 
                                onChange={e => setConfig({...config, slurm_lib_path: e.target.value})}
                                className="h-10 mt-1 bg-white font-mono"
                                placeholder="/usr/local/slurm/lib"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-white border-gray-200 shadow-sm">
                <CardHeader className="p-4 pb-2">
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        System Health
                    </h3>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                    {integrityData && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                            {Object.entries(integrityData).filter(([k]) => k !== 'overall').map(([key, value]: [string, any]) => (
                                <div key={key} className="p-3 bg-white border border-gray-100 rounded-lg flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] text-gray-500 uppercase">{key.replace('_', ' ')}</p>
                                        <p className={cn("text-xs font-medium", value.status === 'healthy' ? "text-emerald-600" : "text-rose-600")}>{value.status}</p>
                                    </div>
                                    {value.status === 'healthy' ? (
                                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                    ) : (
                                        <XCircle className="h-4 w-4 text-rose-500" />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    <Button onClick={runIntegrityCheck} disabled={integrityLoading} variant="outline" size="sm" className="bg-white">
                        {integrityLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Activity className="h-4 w-4 mr-2" />}
                        Check Health Now
                    </Button>
                </CardContent>
            </Card>

            <div className="h-20" />

            <Dialog open={showMaintenanceDialog} onOpenChange={setShowMaintenanceDialog}>
                <DialogContent className="sm:max-w-md !bg-white border-none shadow-[0_50px_100px_rgba(0,0,0,0.3)] !text-black overflow-hidden p-0">
                    <DialogHeader className="p-6 pb-2">
                        <DialogTitle className="flex items-center gap-2 text-black font-black text-xl">
                            <ShieldAlert className="h-6 w-6 text-amber-600" />
                            Maintenance Protocol
                        </DialogTitle>
                        <DialogDescription className="text-gray-500 text-xs font-medium">
                            Whitelist administrative endpoints before system-wide lockdown.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-3">
                        <div className="flex gap-2">
                            <Input 
                                value={newIP}
                                onChange={e => setNewIP(e.target.value)}
                                placeholder="192.168.1.1"
                                className="flex-1"
                            />
                            <Button 
                                size="sm"
                                onClick={async () => {
                                    setAddIPLoading(true);
                                    try {
                                        await settingsApi.addMaintenanceIP(token!, newIP);
                                        setNewIP('');
                                        const res = await settingsApi.getMaintenanceIPs(token!);
                                        setMaintenanceIPs(res.data);
                                        toast.success("IP added to whitelist.");
                                    } catch(e) { toast.error("Failed to add IP."); } 
                                    finally { setAddIPLoading(false); }
                                }}
                                disabled={addIPLoading || !newIP}
                            >
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                            {maintenanceIPs.length === 0 ? (
                                <div className="p-10 text-center border-2 border-dashed border-gray-100 rounded-2xl flex flex-col items-center gap-2">
                                    <ShieldAlert className="h-8 w-8 text-gray-200" />
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">No IP Security Exceptions</p>
                                </div>
                            ) : maintenanceIPs.map(ip => (
                                <div key={ip.id} className="flex justify-between items-center p-3 bg-white border border-gray-100 shadow-sm rounded-xl hover:border-gray-300 transition-all hover:translate-x-1 group">
                                    <div className="flex items-center gap-3">
                                        <div className="h-2 w-2 rounded-full bg-emerald-500" />
                                        <span className="text-xs font-mono font-bold text-gray-700">{ip.ip_address}</span>
                                    </div>
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-7 text-rose-500 hover:text-rose-600"
                                        onClick={async () => {
                                            try { 
                                                await settingsApi.removeMaintenanceIP(token!, ip.id); 
                                                const res = await settingsApi.getMaintenanceIPs(token!); 
                                                setMaintenanceIPs(res.data); 
                                            } catch(e){}
                                        }}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowMaintenanceDialog(false)}>Cancel</Button>
                        <Button onClick={handleActivateMaintenance} disabled={maintenanceIPs.length === 0 || maintenanceLoading}>
                            {maintenanceLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Lock className="h-4 w-4 mr-2" />}
                            Enable Maintenance Mode
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
