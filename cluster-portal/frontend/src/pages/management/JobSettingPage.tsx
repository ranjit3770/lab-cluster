import { useEffect, useState } from "react";
import { 
    Briefcase, Loader2, Activity, Settings as SettingsIcon,
    Layers, Monitor, Zap, Cpu, Scan, Signal, Database, Orbit,
    Power, History, LayoutGrid, Command, ArrowRight, ArrowUpRight,
    Shield, CheckCircle2, XCircle, Lock, Info, RefreshCcw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { settingsApi } from "@/api/settings";
import { cn } from "@/lib/utils";

export default function JobSettingPage() {
    const { token } = useAuth();
    const [loading, setLoading] = useState(false);
    const [systemSettings, setSystemSettings] = useState<any[]>([]);

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
        } catch (err) {
            toast.error(`Failed to update ${key}.`);
        }
    };

    const getSystemValue = (key: string) => {
        return systemSettings.find(s => s.key === key)?.value || '';
    };

    return (
        <div className="flex flex-col gap-4 pb-4 max-w-[1200px] mx-auto w-full animate-in fade-in duration-300">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                    <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Job Settings</h1>
                    <p className="text-xs text-gray-500 flex items-center gap-2 mt-1">
                        <Briefcase className="h-3 w-3" />
                        Configure job execution limits and policies
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={fetchSettings} className="h-9">
                    <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
                </Button>
            </header>

            <Card className="bg-white border-gray-200">
                <CardHeader className="p-4 pb-2">
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <Layers className="h-4 w-4" />
                        Job Limits
                    </h3>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <Label className="text-[10px] font-medium text-gray-500 uppercase">Max Batch Jobs Per User</Label>
                            <Input 
                                defaultValue={getSystemValue('max_batch_jobs_per_user')} 
                                onBlur={(e) => handleUpdateSystemSetting('max_batch_jobs_per_user', e.target.value)}
                                className="h-10 mt-1"
                                placeholder="10"
                            />
                        </div>
                        <div>
                            <Label className="text-[10px] font-medium text-gray-500 uppercase">Max Jupyter Jobs Per User</Label>
                            <Input 
                                defaultValue={getSystemValue('max_jupyter_jobs_per_user')} 
                                onBlur={(e) => handleUpdateSystemSetting('max_jupyter_jobs_per_user', e.target.value)}
                                className="h-10 mt-1"
                                placeholder="2"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-white border-gray-200 shadow-sm overflow-hidden">
                <CardHeader className="p-4 pb-3 flex flex-row items-center justify-between border-b border-gray-50 bg-gray-50/50">
                    <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-tight">Core Service Mesh Awareness</h3>
                    </div>
                    <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-600 border-emerald-200">System Live</Badge>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 border-b border-gray-100">
                        {[
                            { name: 'slurmctld', desc: 'Central Control Daemon' },
                            { name: 'slurmd', desc: 'Compute Node Daemon' },
                            { name: 'slurmdbd', desc: 'Database Interface' },
                            { name: 'slurmrestd', desc: 'REST Proxy Interface' }
                        ].map((srv) => (
                            <div key={srv.name} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors border-r border-b border-gray-100 last:border-r-0 lg:[&:nth-child(4)]:border-r-0 md:[&:nth-child(2n)]:border-r-0">
                                <div>
                                    <h4 className="text-xs font-black text-gray-900 font-mono tracking-tighter uppercase">{srv.name}</h4>
                                    <p className="text-[9px] text-gray-400 font-medium uppercase">{srv.desc}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
                                    <span className="text-[10px] font-bold text-emerald-600 uppercase">Online</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="p-4 bg-gray-50 border-t border-gray-100">
                        <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-3 tracking-widest">Extended System Hooks</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {systemSettings.filter(s => !['max_batch_jobs_per_user', 'max_jupyter_jobs_per_user'].includes(s.key)).map(setting => (
                                <div key={setting.key} className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-xl shadow-sm">
                                    <div className="flex items-center gap-2">
                                        <div className="h-6 w-6 rounded-lg bg-gray-50 flex items-center justify-center">
                                            <Zap className="h-3 w-3 text-gray-400" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-gray-900 uppercase font-mono tracking-tighter">{setting.key.replace(/_/g, ' ')}</p>
                                            <p className="text-[9px] text-gray-400 truncate max-w-[100px]">{setting.value}</p>
                                        </div>
                                    </div>
                                    <Badge variant="outline" className={cn(
                                        "text-[9px] font-bold",
                                        setting.value === 'true' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-gray-50 text-gray-400 border-gray-100"
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
