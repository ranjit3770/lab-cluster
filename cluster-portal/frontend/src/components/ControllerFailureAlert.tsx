import { AlertCircle, RefreshCcw } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface ControllerFailureAlertProps {
    error: string;
    onRetry: () => void;
}

export function ControllerFailureAlert({ error, onRetry }: ControllerFailureAlertProps) {
    return (
        <div className="flex h-screen items-center justify-center p-6 lg:h-full">
            <Alert variant="destructive" className="max-w-2xl gap-4 rounded-lg border-destructive/30 bg-destructive/10 p-6 shadow-xs">
                <div className="flex flex-col gap-5 sm:flex-row">
                    <div className="shrink-0">
                        <div className="flex h-11 w-11 items-center justify-center rounded-md border border-destructive/20 bg-destructive/10">
                            <AlertCircle className="h-5 w-5 text-destructive" aria-hidden />
                        </div>
                    </div>

                    <div className="flex-1 space-y-4">
                        <div className="space-y-1">
                            <AlertTitle className="text-base font-semibold leading-tight text-foreground">
                                Controller Failure
                            </AlertTitle>
                            <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                                Connection to Cluster Management Layer Interrupted
                            </p>
                        </div>

                        <AlertDescription className="space-y-4">
                            <p className="text-sm leading-relaxed text-muted-foreground">
                                The gateway could not reach the cluster REST endpoint or the primary management database.
                                This may be due to a transient network issue or a service restart.
                            </p>

                            <div className="break-all rounded-md border border-border bg-muted/50 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                                <span className="mr-2 font-semibold uppercase text-destructive">Trace:</span>
                                {error}
                            </div>

                            <Button
                                variant="default"
                                size="sm"
                                onClick={onRetry}
                                className="gap-2"
                            >
                                <RefreshCcw className="h-3.5 w-3.5" />
                                Re-Establish Link
                            </Button>
                        </AlertDescription>
                    </div>
                </div>
            </Alert>
        </div>
    );
}
