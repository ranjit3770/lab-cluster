import { useEffect, useState } from "react";
import type { PlatformConfig, MaintenanceIP, IntegrityReport } from "@/api/types";
import {
    Shield, Save, Loader2,
    Clock, Lock, Terminal, Plus, Trash2,
    Info, Activity, Power,
    CheckCircle2, XCircle, ShieldAlert
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { useAuth } from '@/context/useAuth'
import { settingsApi } from "@/api/settings";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
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
    const [config, setConfig] = useState<PlatformConfig>({
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
    const [maintenanceIPs, setMaintenanceIPs] = useState<MaintenanceIP[]>([]);
    const [showMaintenanceDialog, setShowMaintenanceDialog] = useState(false);
    const [newIP, setNewIP] = useState('');
    const [toggleLoading, setToggleLoading] = useState(false);
    const [maintenanceLoading, setMaintenanceLoading] = useState(false);
    const [addIPLoading, setAddIPLoading] = useState(false);
    const [integrityLoading, setIntegrityLoading] = useState(false);
    const [integrityData, setIntegrityData] = useState<IntegrityReport | null>(null);

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
            setConfig((prev) => ({
                ...prev,
                ...cfgRes.data,
                sync_interval_ms: cfgRes.data.sync_interval_ms || prev.sync_interval_ms
            }));
            const mMode = settingsRes.data.find((s) => s.key === "maintenance_mode");
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
        } catch {
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
            } catch {
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
        } catch {
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
        } catch {
            toast.error("Integrity check failed.");
        } finally {
            setIntegrityLoading(false);
        }
    };

    return (
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 pb-4">
            <PageHeader
                title="System Configuration"
                description="Manage cluster settings and connection details"
            />

            {/* Persistent Save action */}
            <div className="pointer-events-none fixed bottom-6 right-6 z-[100]">
                <Button
                    onClick={handleUpdateConfig}
                    disabled={loading}
                    className="pointer-events-auto h-auto gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg hover:bg-primary/90"
                >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Configuration
                </Button>
            </div>

            {user?.role === 'developer' && (
                <Card className={cn(
                    "overflow-hidden rounded-lg border shadow-xs transition-colors",
                    isMaintenanceOn ? "border-warning/40" : "border-border"
                )}>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex min-w-0 items-center gap-4">
                                <div className={cn(
                                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition-colors",
                                    isMaintenanceOn ? "bg-warning/10 text-warning" : "bg-success/10 text-success"
                                )}>
                                    {isMaintenanceOn ? <Lock className="h-5 w-5" aria-hidden /> : <Power className="h-5 w-5" aria-hidden />}
                                </div>
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className={cn(
                                            "text-sm font-semibold tracking-tight",
                                            isMaintenanceOn ? "text-warning" : "text-foreground"
                                        )}>
                                            System Maintenance Mode
                                        </h3>
                                        {isMaintenanceOn && (
                                            <Badge className="animate-pulse border border-warning/20 bg-warning/10 text-[9px] font-bold uppercase tracking-widest text-warning">
                                                System Restricted
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="mt-1 flex items-center gap-2">
                                        <span className={cn(
                                            "h-1.5 w-1.5 rounded-full",
                                            isMaintenanceOn ? "animate-pulse bg-warning" : "bg-success"
                                        )} aria-hidden />
                                        <p className={cn(
                                            "text-xs font-medium",
                                            isMaintenanceOn ? "text-warning" : "text-success"
                                        )}>
                                            {isMaintenanceOn ? "Restricted Access Protocol" : "Public Operational State"}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-3">
                                {toggleLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
                                <div className="flex flex-col items-end gap-1">
                                    <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                        {isMaintenanceOn ? "Deactivate" : "Activate"}
                                    </Label>
                                    <Switch
                                        checked={isMaintenanceOn}
                                        onCheckedChange={toggleMaintenance}
                                        disabled={toggleLoading}
                                        className="data-[state=checked]:bg-warning"
                                    />
                                </div>
                            </div>
                        </div>
                    </CardContent>

                    {isMaintenanceOn && (
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-warning/20 bg-warning/10 px-4 py-2">
                            <div className="flex items-center gap-2 text-[11px] font-medium text-warning">
                                <Info className="h-3 w-3 shrink-0" aria-hidden />
                                <span>External Job Submissions are currently rejected for all non-whitelisted IPs.</span>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowMaintenanceDialog(true)}
                                className="h-6 px-2 text-[11px] font-semibold uppercase tracking-wide text-warning hover:bg-warning/10 hover:text-warning"
                            >
                                Manage Protocol Whitelist
                            </Button>
                        </div>
                    )}
                </Card>
            )}

            <Card className="rounded-lg border-border shadow-xs">
                <CardHeader className="border-b border-border px-4 py-3 [.border-b]:pb-3">
                    <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <Info className="h-3.5 w-3.5 text-primary" aria-hidden />
                        Cluster Info
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                            <Label className="mb-1.5 block text-xs font-medium text-foreground">Cluster Name</Label>
                            <Input
                                value={config.cluster_name}
                                onChange={e => setConfig({...config, cluster_name: e.target.value})}
                                placeholder="Cluster Name"
                            />
                        </div>
                        <div>
                            <Label className="mb-1.5 block text-xs font-medium text-foreground">Description</Label>
                            <Input
                                value={config.cluster_description}
                                onChange={e => setConfig({...config, cluster_description: e.target.value})}
                                placeholder="Short description"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="rounded-lg border-border shadow-xs">
                <CardHeader className="border-b border-border px-4 py-3 [.border-b]:pb-3">
                    <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <Clock className="h-3.5 w-3.5 text-primary" aria-hidden />
                        Update Speeds
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <Label className="mb-1.5 block text-xs font-medium text-foreground">Session length (seconds)</Label>
                            <Input
                                type="number"
                                value={config.session_timeout_seconds}
                                onChange={e => setConfig({...config, session_timeout_seconds: parseInt(e.target.value)})}
                            />
                        </div>
                        <div>
                            <Label className="mb-1.5 block text-xs font-medium text-foreground">Sync Speed (ms)</Label>
                            <Input
                                type="number"
                                value={config.sync_interval_ms}
                                onChange={e => setConfig({...config, sync_interval_ms: parseInt(e.target.value)})}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="rounded-lg border-border shadow-xs">
                <CardHeader className="border-b border-border px-4 py-3 [.border-b]:pb-3">
                    <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <Terminal className="h-3.5 w-3.5 text-primary" aria-hidden />
                        Slurm Connection
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                            <Label className="mb-1.5 block text-xs font-medium text-foreground">REST API URL</Label>
                            <Input
                                value={config.slurm_rest_url}
                                onChange={e => setConfig({...config, slurm_rest_url: e.target.value})}
                                className="font-mono text-xs"
                                placeholder="http://..."
                            />
                        </div>
                        <div>
                            <Label className="mb-1.5 block text-xs font-medium text-foreground">Node API URL</Label>
                            <Input
                                value={config.slurm_node_api}
                                onChange={e => setConfig({...config, slurm_node_api: e.target.value})}
                                className="font-mono text-xs"
                                placeholder="http://..."
                            />
                        </div>
                        <div>
                            <Label className="mb-1.5 block text-xs font-medium text-foreground">Job API URL</Label>
                            <Input
                                value={config.external_job_api_url}
                                onChange={e => setConfig({...config, external_job_api_url: e.target.value})}
                                className="font-mono text-xs"
                                placeholder="http://..."
                            />
                        </div>
                        <div>
                            <Label className="mb-1.5 block text-xs font-medium text-foreground">Slurm Version</Label>
                            <Input
                                value={config.slurm_version}
                                onChange={e => setConfig({...config, slurm_version: e.target.value})}
                                placeholder="v0.0.41"
                            />
                        </div>
                        <div>
                            <Label className="mb-1.5 block text-xs font-medium text-foreground">JWT User (Slurmrestd)</Label>
                            <Input
                                value={config.slurm_jwt_user}
                                onChange={e => setConfig({...config, slurm_jwt_user: e.target.value})}
                                className="font-mono text-xs"
                                placeholder="slurmrestd"
                            />
                        </div>
                        <div>
                            <Label className="mb-1.5 block text-xs font-medium text-foreground">Slurm Path (Bin/Sbin)</Label>
                            <Input
                                value={config.slurm_path}
                                onChange={e => setConfig({...config, slurm_path: e.target.value})}
                                className="font-mono text-xs"
                                placeholder="/usr/local/slurm/bin..."
                            />
                        </div>
                        <div>
                            <Label className="mb-1.5 block text-xs font-medium text-foreground">Slurm Lib Path (LD_LIBRARY_PATH)</Label>
                            <Input
                                value={config.slurm_lib_path}
                                onChange={e => setConfig({...config, slurm_lib_path: e.target.value})}
                                className="font-mono text-xs"
                                placeholder="/usr/local/slurm/lib"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="rounded-lg border-border shadow-xs">
                <CardHeader className="border-b border-border px-4 py-3 [.border-b]:pb-3">
                    <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <Shield className="h-3.5 w-3.5 text-primary" aria-hidden />
                        System Health
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-4">
                    {integrityData && (
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                            {Object.entries(integrityData).filter(([k]) => k !== 'overall').map(([key, value]) => (
                                <div key={key} className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{key.replace('_', ' ')}</p>
                                        <p className={cn("text-xs font-medium", value.status === 'healthy' ? "text-success" : "text-destructive")}>{value.status}</p>
                                    </div>
                                    {value.status === 'healthy' ? (
                                        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
                                    ) : (
                                        <XCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    <Button onClick={runIntegrityCheck} disabled={integrityLoading} variant="outline" size="sm">
                        {integrityLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
                        Check Health Now
                    </Button>
                </CardContent>
            </Card>

            <div className="h-20" />

            <Dialog open={showMaintenanceDialog} onOpenChange={setShowMaintenanceDialog}>
                <DialogContent className="gap-0 overflow-hidden rounded-xl p-0 sm:max-w-md">
                    <DialogHeader className="border-b border-border px-5 py-4">
                        <DialogTitle className="flex items-center gap-2 text-base">
                            <ShieldAlert className="h-4 w-4 text-warning" aria-hidden />
                            Maintenance Protocol
                        </DialogTitle>
                        <DialogDescription className="mt-1 text-xs">
                            Whitelist administrative endpoints before system-wide lockdown.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 px-5 py-4">
                        <div className="flex gap-2">
                            <Input
                                value={newIP}
                                onChange={e => setNewIP(e.target.value)}
                                placeholder="192.168.1.1"
                                className="flex-1 font-mono text-xs"
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
                                    } catch { toast.error("Failed to add IP."); }
                                    finally { setAddIPLoading(false); }
                                }}
                                disabled={addIPLoading || !newIP}
                            >
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                            {maintenanceIPs.length === 0 ? (
                                <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-6 py-8">
                                    <ShieldAlert className="h-6 w-6 text-muted-foreground/40" aria-hidden />
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">No IP Security Exceptions</p>
                                </div>
                            ) : maintenanceIPs.map(ip => (
                                <div key={ip.id} className="group flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 transition-colors hover:bg-accent/40">
                                    <div className="flex items-center gap-2.5">
                                        <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                                        <span className="font-mono text-xs font-medium text-foreground">{ip.ip_address}</span>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                        onClick={async () => {
                                            try {
                                                await settingsApi.removeMaintenanceIP(token!, ip.id);
                                                const res = await settingsApi.getMaintenanceIPs(token!);
                                                setMaintenanceIPs(res.data);
                                            } catch {
                                                // Removal already failed at the API; list stays as-is.
                                            }
                                        }}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <DialogFooter className="border-t border-border bg-muted/30 px-5 py-3">
                        <Button variant="outline" size="sm" onClick={() => setShowMaintenanceDialog(false)}>Cancel</Button>
                        <Button onClick={handleActivateMaintenance} disabled={maintenanceIPs.length === 0 || maintenanceLoading} size="sm">
                            {maintenanceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                            Enable Maintenance Mode
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
