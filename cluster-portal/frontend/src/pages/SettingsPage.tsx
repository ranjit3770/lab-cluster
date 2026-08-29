import { useEffect, useState } from "react";
import type { SystemSetting, MaintenanceIP } from "@/api/types";
import {
    Save, Loader2, Briefcase,
    AlertTriangle,
    Settings as SettingsIcon, Terminal, Plus, Trash2, Globe,
    Cpu, Clock, Database, Key,
    Activity, RefreshCcw, Command
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAuth } from '@/context/useAuth'
import { settingsApi } from "@/api/settings";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";
import DeveloperPage from "./DeveloperPage";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";

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
    const [systemSettings, setSystemSettings] = useState<SystemSetting[]>([]);
    const [isMaintenanceOn, setIsMaintenanceOn] = useState(false);

    // Whitelist State
    const [showMaintenanceDialog, setShowMaintenanceDialog] = useState(false);
    const [maintenanceIPs, setMaintenanceIPs] = useState<MaintenanceIP[]>([]);
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
            const mMode = res.data.find((s) => s.key === "maintenance_mode");
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
        } catch {
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
        } catch {
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
            } catch {
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
        } catch {
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
        } catch {
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
        } catch {
            toast.error("Failed to revoke identity.");
        } finally {
            setRemoveIPLoading(null);
        }
    };

    const getSystemValue = (key: string) => {
        return systemSettings.find(s => s.key === key)?.value || '';
    };

    return (
        <div className="flex flex-col gap-6 pb-8">
            <div>
                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <Command className="h-3 w-3" aria-hidden />
                    Control Plane / Orchestrator Config
                </p>
                <PageHeader
                    title="Settings"
                    description="Adjust core system behavior, security protocols, and job arbitration limits."
                />
            </div>

            <div className="flex flex-col gap-4 lg:flex-row">
                {/* Nav Sidebar */}
                <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-64">
                    <Card className="rounded-lg border-border p-2 shadow-xs">
                        <nav className="flex flex-col gap-1">
                            {[
                                { id: 'general', label: 'General', icon: SettingsIcon, description: 'Core system' },
                                { id: 'jobs', label: 'Arbitration', icon: Briefcase, description: 'Job scheduler limits' },
                                { id: 'developer', label: 'Terminal', icon: Terminal, description: 'Direct access' }
                            ].map((tab) => (activeTab !== 'developer' || tab.id === 'developer' ? (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={cn(
                                        "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
                                        activeTab === tab.id
                                            ? "bg-accent text-accent-foreground"
                                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                                    )}
                                >
                                    <tab.icon
                                        className={cn(
                                            "h-4 w-4 shrink-0",
                                            activeTab === tab.id ? "text-primary" : "text-muted-foreground"
                                        )}
                                        aria-hidden
                                    />
                                    <span className="min-w-0">
                                        <span className={cn("block text-sm leading-tight", activeTab === tab.id && "font-medium")}>{tab.label}</span>
                                        <span className="block text-[11px] leading-tight text-muted-foreground">{tab.description}</span>
                                    </span>
                                </button>
                            ) : null))}
                        </nav>
                    </Card>

                    {activeTab !== 'developer' && (
                        <Card className="rounded-lg border-border p-4 shadow-xs">
                            <div className="flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Security Node</span>
                            </div>
                            <h3 className="mt-2 text-sm font-semibold text-foreground">Encrypted Link</h3>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">High-priority configuration parity maintained across all clusters.</p>
                        </Card>
                    )}
                </aside>

                {/* Main Content Area */}
                <main className={cn(
                    "min-w-0 flex-1 rounded-lg border border-border bg-card shadow-xs",
                    activeTab === 'developer' ? "overflow-hidden" : "p-5 lg:p-6"
                )}>
                    {activeTab === 'general' && (
                        <div className="space-y-6">
                             {/* Maintenance Section */}
                             <section className={cn(
                                 "flex flex-col gap-6 rounded-lg border p-5 md:flex-row md:items-center md:justify-between",
                                 isMaintenanceOn ? "border-warning/30 bg-warning/10" : "border-border bg-muted/30"
                             )}>
                                 <div className="space-y-3">
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
                                            isMaintenanceOn ? "bg-warning text-warning-foreground" : "bg-primary text-primary-foreground"
                                        )}>
                                            <AlertTriangle className="h-5 w-5" aria-hidden />
                                        </div>
                                        <div>
                                          <h2 className="text-base font-semibold text-foreground">System Lockout</h2>
                                          <p className={cn(
                                            "mt-0.5 text-[11px] font-medium uppercase tracking-wide",
                                            isMaintenanceOn ? "text-warning" : "text-muted-foreground"
                                          )}>Maintenance Mode Control</p>
                                        </div>
                                    </div>
                                    <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                                        {isMaintenanceOn
                                            ? "PROTOCOL ACTIVE: All non-privileged user access is severed. Platform only accessible via whitelisted identities."
                                            : "PUBLIC STATE: System is fully operational and accepting all authenticated researchers."
                                        }
                                    </p>
                                 </div>
                                 <div className="flex min-w-[180px] flex-col items-center gap-3 self-start rounded-lg border border-border bg-card p-5 md:self-auto">
                                     <span className={cn(
                                         "text-[11px] font-semibold uppercase tracking-wide",
                                         isMaintenanceOn ? "text-warning" : "text-primary"
                                     )}>{isMaintenanceOn ? "LOCKDOWN" : "PUBLIC SITE"}</span>
                                     <Switch
                                        checked={isMaintenanceOn}
                                        onCheckedChange={toggleMaintenance}
                                        disabled={toggleLoading}
                                     />
                                     {toggleLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                                 </div>
                             </section>

                             {/* Config Sections */}
                             <div className="grid gap-6 md:grid-cols-2">
                                <div className="space-y-4">
                                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    <Globe className="h-3.5 w-3.5 text-primary" aria-hidden />
                                    Network Interface
                                  </h3>

                                  <div className="space-y-5 rounded-lg border border-border bg-muted/30 p-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-medium text-foreground">Scheduler REST API Endpoint</Label>
                                        <div className="relative">
                                            <Input
                                                value={config.slurm_rest_url}
                                                onChange={e => setConfig({...config, slurm_rest_url: e.target.value})}
                                                className="h-9 pr-20 font-mono text-xs"
                                                placeholder="http://cluster-api:6820"
                                            />
                                            <Badge className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 border-primary/20 bg-primary/10 text-[10px] font-medium text-primary">REST</Badge>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-medium text-foreground">Researcher Session TTL (S)</Label>
                                        <div className="relative">
                                            <Input
                                                type="number"
                                                value={config.session_timeout_seconds}
                                                onChange={e => setConfig({...config, session_timeout_seconds: parseInt(e.target.value)})}
                                                className="h-9 pr-10 font-mono text-sm tabular-nums"
                                            />
                                            <Clock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" aria-hidden />
                                        </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-4">
                                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    <Activity className="h-3.5 w-3.5 text-primary" aria-hidden />
                                    Heartbeat &amp; Sync
                                  </h3>

                                  <div className="space-y-5 rounded-lg border border-border bg-muted/30 p-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-medium text-foreground">Telemetry Interval (MS)</Label>
                                        <div className="relative">
                                            <Input
                                                type="number"
                                                value={config.sync_interval_ms}
                                                onChange={e => setConfig({...config, sync_interval_ms: parseInt(e.target.value)})}
                                                className="h-9 pr-10 font-mono text-sm tabular-nums"
                                            />
                                            <RefreshCcw className={cn("pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50", loading && "animate-spin")} aria-hidden />
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/10 p-4">
                                      <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Authorization</p>
                                        <p className="mt-0.5 text-[11px] text-muted-foreground">TLS 1.4 Active Network</p>
                                      </div>
                                      <Badge className="border-none bg-primary text-[10px] font-medium text-primary-foreground">VERIFIED</Badge>
                                    </div>
                                  </div>
                                </div>
                             </div>

                             <Button
                                onClick={handleUpdateConfig}
                                disabled={loading}
                             >
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                                  <>
                                    <Save className="h-4 w-4" />
                                    Commit Platform Protocol
                                  </>
                                )}
                             </Button>
                        </div>
                    )}

                    {activeTab === 'jobs' && (
                        <div className="space-y-6">
                             <div className="space-y-1">
                                <h2 className="text-lg font-semibold text-foreground">Resource Arbitration</h2>
                                <p className="text-xs text-muted-foreground">Global partition limits and compute workload governance.</p>
                             </div>

                             <div className="grid gap-6 md:grid-cols-2">
                                <div className="space-y-6">
                                  <Card className="space-y-5 rounded-lg border-border p-5 shadow-xs">
                                      <div className="flex items-center gap-3">
                                          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                                              <Cpu className="h-4 w-4 text-primary" aria-hidden />
                                          </div>
                                          <div>
                                            <p className="text-sm font-semibold text-foreground">Logic Core Quota</p>
                                            <p className="text-[11px] text-muted-foreground">Global compute cap</p>
                                          </div>
                                      </div>

                                      <div className="space-y-4">
                                          <div className="space-y-1.5">
                                              <Label className="text-xs font-medium text-foreground">Max CPU Cores (Unit)</Label>
                                              <Input
                                                  defaultValue={getSystemValue('max_job_cpu')}
                                                  onBlur={(e) => handleUpdateSystemSetting('max_job_cpu', e.target.value)}
                                                  className="h-9 font-mono text-sm tabular-nums"
                                              />
                                          </div>
                                          <div className="space-y-1.5">
                                              <Label className="text-xs font-medium text-foreground">Job Stack Limit (Concurrent)</Label>
                                              <Input
                                                  defaultValue={getSystemValue('max_batch_jobs_per_user')}
                                                  onBlur={(e) => handleUpdateSystemSetting('max_batch_jobs_per_user', e.target.value)}
                                                  className="h-9 font-mono text-sm tabular-nums"
                                              />
                                          </div>
                                      </div>
                                  </Card>

                                  <Card className="space-y-5 rounded-lg border-border p-5 shadow-xs">
                                      <div className="flex items-center gap-3">
                                          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-info/10">
                                              <Clock className="h-4 w-4 text-info" aria-hidden />
                                          </div>
                                          <div>
                                            <p className="text-sm font-semibold text-foreground">Chronos Control</p>
                                            <p className="text-[11px] text-muted-foreground">Walltime thresholds</p>
                                          </div>
                                      </div>
                                      <div className="space-y-1.5">
                                          <Label className="text-xs font-medium text-foreground">Sequence Duration Hard-Cap (H)</Label>
                                          <Input
                                              defaultValue={getSystemValue('max_job_time_hours')}
                                              onBlur={(e) => handleUpdateSystemSetting('max_job_time_hours', e.target.value)}
                                              className="h-9 font-mono text-sm tabular-nums"
                                          />
                                      </div>
                                  </Card>
                                </div>

                                <Card className="flex flex-col space-y-5 rounded-lg border-border p-5 shadow-xs">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-success/10">
                                            <Database className="h-4 w-4 text-success" aria-hidden />
                                        </div>
                                        <div>
                                          <p className="text-sm font-semibold text-foreground">Memory Partitioning</p>
                                          <p className="text-[11px] text-muted-foreground">Cluster RAM governance</p>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-medium text-foreground">Global Allocation Barrier (GB)</Label>
                                        <Input
                                            defaultValue={getSystemValue('max_job_mem_gb')}
                                            onBlur={(e) => handleUpdateSystemSetting('max_job_mem_gb', e.target.value)}
                                            className="h-9 font-mono text-sm tabular-nums"
                                        />
                                    </div>
                                    <div className="mt-auto rounded-lg border border-border bg-muted/40 p-4">
                                         <Badge variant="outline" className="border-transparent bg-secondary text-[10px] font-medium text-secondary-foreground">Scheduler_v2</Badge>
                                         <p className="mt-3 text-sm font-semibold text-foreground">Dynamic Arbitration</p>
                                         <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Resources are dynamically scaled and arbitrated by the scheduler backfill strategy based on active partition load metadata.</p>
                                    </div>
                                </Card>
                             </div>
                        </div>
                    )}

                    {activeTab === 'developer' && (
                        <div className="h-full">
                            <DeveloperPage preselectedNodeId={state?.selectedNode} />
                        </div>
                    )}
                </main>
            </div>

            {/* Maintenance Dialog */}
            <Dialog open={showMaintenanceDialog} onOpenChange={(open) => {
                if (!open && !maintenanceLoading) setShowMaintenanceDialog(false);
            }}>
                <DialogContent className="gap-0 overflow-hidden rounded-lg border-border bg-popover p-0 shadow-lg sm:max-w-lg">
                    <DialogHeader className="border-b border-border px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-warning/20 bg-warning/10">
                            <Key className="h-5 w-5 text-warning" aria-hidden />
                          </div>
                          <div>
                            <DialogTitle className="text-base font-semibold text-foreground">Access Whitelist</DialogTitle>
                            <DialogDescription className="text-[11px] font-medium uppercase tracking-wide text-warning">Authorized Maintenance Terminals</DialogDescription>
                          </div>
                        </div>
                    </DialogHeader>

                    <div className="space-y-5 px-5 py-5">
                        <div className="flex gap-3">
                            <div className="flex-1 space-y-1.5">
                                <Label className="text-xs font-medium text-foreground">IPv4 Endpoint</Label>
                                <Input
                                    value={newIP}
                                    onChange={e => setNewIP(e.target.value)}
                                    placeholder="192.168.1.100"
                                    className="h-9 font-mono text-xs"
                                />
                            </div>
                            <div className="w-32 space-y-1.5 sm:w-36">
                                <Label className="text-xs font-medium text-foreground">Identity</Label>
                                <Input
                                    value={newIPLabel}
                                    onChange={e => setNewIPLabel(e.target.value)}
                                    placeholder="ADMIN_WS"
                                    className="h-9 text-xs uppercase"
                                />
                            </div>
                            <div className="pt-7">
                                <Button
                                    onClick={addWhitelistedIP}
                                    disabled={addIPLoading || !newIP}
                                    size="icon"
                                    className="h-9 w-9 shrink-0"
                                    aria-label="Add IP"
                                >
                                    {addIPLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Registry: {maintenanceIPs.length} Active Nodes</p>
                            <div className="custom-scrollbar max-h-[220px] space-y-2 overflow-y-auto pr-1">
                                {maintenanceIPs.length === 0 ? (
                                  <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-center">
                                    <AlertTriangle className="h-5 w-5 text-muted-foreground" aria-hidden />
                                    <p className="text-xs text-muted-foreground">No terminals authorized. System lock will fail.</p>
                                  </div>
                                ) : maintenanceIPs.map(ip => (
                                    <div key={ip.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                                                <Terminal className="h-4 w-4 text-muted-foreground" aria-hidden />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate font-mono text-sm text-foreground">{ip.ip_address}</p>
                                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{ip.label || 'INTERNAL_TERMINAL'}</p>
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                            onClick={() => removeWhitelistedIP(ip.id)}
                                            disabled={removeIPLoading === ip.id}
                                            aria-label={`Remove ${ip.ip_address}`}
                                        >
                                            {removeIPLoading === ip.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex gap-3 pt-1">
                            <Button
                                variant="outline"
                                className="h-9 flex-1 text-xs uppercase tracking-wide"
                                onClick={() => setShowMaintenanceDialog(false)}
                            >
                                Defer Link
                            </Button>
                            <Button
                                variant="warning"
                                onClick={handleActivateMaintenance}
                                disabled={maintenanceIPs.length === 0 || maintenanceLoading}
                                className="h-9 flex-[2] text-xs font-semibold uppercase tracking-wide"
                            >
                                {maintenanceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "ACTIVATE LOCKDOWN"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
