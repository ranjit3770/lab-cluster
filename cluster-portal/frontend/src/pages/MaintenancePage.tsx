import { Shield, Clock, Database, Terminal, Lock, Gauge, Signal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function MaintenancePage() {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <Card className="max-w-2xl w-full shadow-sm">
                <CardHeader className="text-center pb-2">
                    <div className="mx-auto mb-4">
                        <div className="h-16 w-16 rounded-xl bg-warning/10 flex items-center justify-center">
                            <Lock className="h-8 w-8 text-warning" aria-hidden />
                        </div>
                    </div>
                    <CardTitle className="text-2xl font-bold text-foreground">Maintenance Mode</CardTitle>
                    <CardDescription>
                        The HPC Portal is currently undergoing scheduled maintenance.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="rounded-lg border border-warning/20 bg-warning/10 p-4">
                        <div className="flex items-center gap-3 mb-2">
                            <Signal className="h-4 w-4 text-warning animate-pulse" aria-hidden />
                            <span className="text-sm font-semibold text-warning">System Status</span>
                        </div>
                        <p className="text-xs text-warning/80">
                            The cluster control plane is undergoing scheduled synchronization. Interactive sessions are temporarily restricted.
                        </p>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-lg border border-border bg-muted/50 p-3 text-center shadow-xs">
                            <Clock className="h-5 w-5 text-info mx-auto mb-1" aria-hidden />
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">ETA</p>
                            <p className="text-sm font-semibold text-foreground">30 Mins</p>
                        </div>
                        <div className="rounded-lg border border-border bg-muted/50 p-3 text-center shadow-xs">
                            <Shield className="h-5 w-5 text-success mx-auto mb-1" aria-hidden />
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Integrity</p>
                            <p className="text-sm font-semibold text-foreground">Verified</p>
                        </div>
                        <div className="rounded-lg border border-border bg-muted/50 p-3 text-center shadow-xs">
                            <Gauge className="h-5 w-5 text-primary mx-auto mb-1" aria-hidden />
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Latency</p>
                            <p className="text-sm font-semibold text-foreground">Minimum</p>
                        </div>
                    </div>

                    <div className="border-t border-border pt-4">
                        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                                <Terminal className="h-3 w-3" aria-hidden />
                                <span>Admin Mode Active</span>
                            </div>
                            <div className="h-4 w-px bg-border" aria-hidden />
                            <div className="flex items-center gap-1">
                                <Database className="h-3 w-3" aria-hidden />
                                <span>Syncing Registry</span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
