import { useEffect, useState } from "react";
import type { SystemSetting } from "@/api/types";
import {
    Briefcase, Activity,
    Layers, Zap, RefreshCcw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from '@/context/useAuth'
import { settingsApi } from "@/api/settings";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";

export default function JobSettingPage() {
    const { token } = useAuth();
    const [loading, setLoading] = useState(false);
    const [systemSettings, setSystemSettings] = useState<SystemSetting[]>([]);

    useEffect(() => {
        if (token) {
            fetchSettings();
        }
    }, [token]);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const res = await settingsApi.getSystemSettings(token!);
            setSystemSettings(res.data);
        } catch (err) {
            console.error(err);
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

    const getSystemValue = (key: string) => {
        return systemSettings.find(s => s.key === key)?.value || '';
    };

    return (
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 pb-4">
            <PageHeader
                title="Job Settings"
                description={
                    <span className="inline-flex items-center gap-1.5">
                        <Briefcase className="h-3 w-3" aria-hidden />
                        Configure job execution limits and policies
                    </span>
                }
                actions={
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchSettings}
                        aria-label="Refresh job settings"
                    >
                        <RefreshCcw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                    </Button>
                }
            />

            <Card className="rounded-lg border-border shadow-xs">
                <CardHeader className="border-b border-border px-4 py-3 [.border-b]:pb-3">
                    <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <Layers className="h-3.5 w-3.5 text-primary" aria-hidden />
                        Job Limits
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                            <Label className="mb-1.5 block text-xs font-medium text-foreground">Max Batch Jobs Per User</Label>
                            <Input
                                defaultValue={getSystemValue('max_batch_jobs_per_user')}
                                onBlur={(e) => handleUpdateSystemSetting('max_batch_jobs_per_user', e.target.value)}
                                placeholder="10"
                            />
                        </div>
                        <div>
                            <Label className="mb-1.5 block text-xs font-medium text-foreground">Max Jupyter Jobs Per User</Label>
                            <Input
                                defaultValue={getSystemValue('max_jupyter_jobs_per_user')}
                                onBlur={(e) => handleUpdateSystemSetting('max_jupyter_jobs_per_user', e.target.value)}
                                placeholder="2"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="overflow-hidden rounded-lg border-border shadow-xs">
                <CardHeader className="flex-row items-center justify-between border-b border-border px-4 py-3 [.border-b]:pb-3">
                    <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <Activity className="h-3.5 w-3.5 text-primary" aria-hidden />
                        Core Service Mesh Awareness
                    </CardTitle>
                    <Badge variant="outline" className="border-success/20 bg-success/10 text-[10px] font-medium text-success">
                        System Live
                    </Badge>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-2 lg:grid-cols-4">
                        {[
                            { name: 'scheduler', desc: 'Central Control Daemon' },
                            { name: 'node-agent', desc: 'Compute Node Daemon' },
                            { name: 'acct-db', desc: 'Accounting Database' },
                            { name: 'rest-api', desc: 'REST API Interface' }
                        ].map((srv) => (
                            <div key={srv.name} className="flex items-center justify-between gap-2 bg-card p-4">
                                <div className="min-w-0">
                                    <h4 className="font-mono text-xs font-semibold uppercase tracking-tight text-foreground">{srv.name}</h4>
                                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{srv.desc}</p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    <span className="h-2 w-2 animate-pulse rounded-full bg-success" aria-hidden />
                                    <span className="text-[11px] font-semibold uppercase text-success">Online</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="border-t border-border bg-muted/40 p-4">
                        <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Extended System Hooks</h4>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {systemSettings.filter(s => !['max_batch_jobs_per_user', 'max_jupyter_jobs_per_user'].includes(s.key)).map(setting => (
                                <div key={setting.key} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card p-3 shadow-xs">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted">
                                            <Zap className="h-3 w-3 text-muted-foreground" aria-hidden />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate font-mono text-[11px] font-semibold uppercase tracking-tight text-foreground">{setting.key.replace(/_/g, ' ')}</p>
                                            <p className="truncate text-[10px] text-muted-foreground">{setting.value}</p>
                                        </div>
                                    </div>
                                    <Badge variant="outline" className={cn(
                                        "shrink-0 text-[10px] font-semibold",
                                        setting.value === 'true'
                                            ? "border-success/20 bg-success/10 text-success"
                                            : "border-border bg-muted text-muted-foreground"
                                    )}>
                                        {setting.value === 'true' ? 'ENABLED' : 'PASSIVE'}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
