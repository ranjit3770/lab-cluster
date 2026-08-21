import { AlertCircle, RefreshCcw } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface ControllerFailureAlertProps {
    error: string;
    onRetry: () => void;
}

export function ControllerFailureAlert({ error, onRetry }: ControllerFailureAlertProps) {
    return (
        <div className="flex items-center justify-center h-screen lg:h-full max-w-2xl mx-auto p-6 animate-in fade-in zoom-in duration-300">
            <Alert variant="destructive" className="border border-rose-500/30 shadow-xl shadow-rose-500/10 bg-card rounded-2xl p-8 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-rose-500 to-rose-600" />
                
                <div className="flex gap-6">
                    <div className="flex-shrink-0">
                        <div className="h-12 w-12 bg-rose-500/10 rounded-xl flex items-center justify-center border border-rose-500/20">
                            <AlertCircle className="h-6 w-6 text-rose-400" />
                        </div>
                    </div>
                    
                    <div className="flex-1 space-y-4">
                        <div className="space-y-1">
                            <AlertTitle className="text-xl font-black uppercase tracking-tight text-foreground leading-none">
                                Controller Failure
                            </AlertTitle>
                            <p className="text-muted-foreground font-mono text-[9px] uppercase tracking-widest italic">
                                Connection to Cluster Management Layer Interrupted
                            </p>
                        </div>
                        
                        <AlertDescription className="space-y-4">
                            <p className="font-mono text-sm text-muted-foreground leading-relaxed">
                                The gateway could not reach the Slurm REST endpoint or the primary management database. 
                                This may be due to a transient network issue or a service restart.
                            </p>
                            
                            <div className="bg-secondary/50 p-4 rounded-xl text-[11px] font-mono border border-border/50 text-muted-foreground break-all leading-relaxed">
                                <span className="text-rose-400 font-bold mr-2 uppercase text-[9px]">Trace:</span>
                                {error}
                            </div>
                            
                            <Button 
                                variant="default" 
                                onClick={onRetry} 
                                className="group w-full lg:w-auto gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase text-[10px] tracking-widest h-11 px-6 rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                            >
                                <RefreshCcw className="h-4 w-4 group-hover:rotate-180 transition-transform duration-500" /> 
                                Re-Establish Link
                            </Button>
                        </AlertDescription>
                    </div>
                </div>
            </Alert>
        </div>
    );
}
