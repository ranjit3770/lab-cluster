import { AlertCircle, Shield, Clock, Database, Terminal, Lock, Zap, Gauge, Server, Globe, Signal, Scan, Orbit, Power, History, Network, Cpu as CpuIcon, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function MaintenancePage() {
    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <Card className="max-w-2xl w-full bg-white border-gray-200 shadow-lg">
                <CardHeader className="text-center pb-2">
                    <div className="mx-auto mb-4">
                        <div className="h-16 w-16 bg-amber-100 rounded-2xl flex items-center justify-center">
                            <Lock className="h-8 w-8 text-amber-600" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl font-bold text-gray-900">Maintenance Mode</CardTitle>
                    <CardDescription className="text-gray-500">
                        The HPC Portal is currently undergoing scheduled maintenance.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <div className="flex items-center gap-3 mb-2">
                            <Signal className="h-4 w-4 text-amber-600 animate-pulse" />
                            <span className="text-sm font-semibold text-amber-800">System Status</span>
                        </div>
                        <p className="text-xs text-amber-700">
                            The cluster control plane is undergoing scheduled synchronization. Interactive sessions are temporarily restricted.
                        </p>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
                            <Clock className="h-5 w-5 text-blue-500 mx-auto mb-1" />
                            <p className="text-[10px] text-gray-500 uppercase mb-1">ETA</p>
                            <p className="text-sm font-bold text-gray-900">30 Mins</p>
                        </div>
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
                            <Shield className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
                            <p className="text-[10px] text-gray-500 uppercase mb-1">Integrity</p>
                            <p className="text-sm font-bold text-gray-900">Verified</p>
                        </div>
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
                            <Gauge className="h-5 w-5 text-purple-500 mx-auto mb-1" />
                            <p className="text-[10px] text-gray-500 uppercase mb-1">Latency</p>
                            <p className="text-sm font-bold text-gray-900">Minimum</p>
                        </div>
                    </div>

                    <div className="border-t border-gray-200 pt-4">
                        <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
                            <div className="flex items-center gap-1">
                                <Terminal className="h-3 w-3" />
                                <span>Admin Mode Active</span>
                            </div>
                            <div className="h-4 w-px bg-gray-300" />
                            <div className="flex items-center gap-1">
                                <Database className="h-3 w-3" />
                                <span>Syncing Registry</span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
