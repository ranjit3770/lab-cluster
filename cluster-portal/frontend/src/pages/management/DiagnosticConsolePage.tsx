import {
    ChevronLeft,
    Monitor,
    AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from '@/context/useAuth'
import { useState, useEffect } from "react";
import { devNodesApi, type DevNode } from "@/api/devNodes";
import { DevTerminal } from "@/components/DevTerminal";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";

export default function DiagnosticConsolePage() {
    const { token } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const nodeId = searchParams.get('node');

    const [node, setNode] = useState<DevNode | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (token && nodeId) {
            fetchNode();
        }
    }, [token, nodeId]);

    const fetchNode = async () => {
        setLoading(true);
        try {
            const res = await devNodesApi.getNodes(token!);
            const found = res.data.find(n => n.id === parseInt(nodeId!));
            setNode(found || null);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (!nodeId) {
        return (
            <div className="flex h-full items-center justify-center p-8">
                <EmptyState
                    icon={Monitor}
                    title="Select a Node"
                    description="Choose a node from Admin Tools to open terminal"
                    action={
                        <Button
                            onClick={() => navigate('/management/admin-tools')}
                            variant="outline"
                            size="sm"
                        >
                            <ChevronLeft className="h-4 w-4" />
                            Go to Admin Tools
                        </Button>
                    }
                />
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center gap-3">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" aria-hidden />
                <span className="text-sm text-muted-foreground">Loading...</span>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col gap-4 p-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => navigate('/management/admin-tools')}
                        aria-label="Back to Admin Tools"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="min-w-0">
                        <h1 className="truncate text-lg font-semibold text-foreground">{node?.name || 'Terminal'}</h1>
                        <p className="truncate font-mono text-xs text-muted-foreground">{node?.ip_address}</p>
                    </div>
                </div>
                <Badge variant="outline" className="shrink-0 gap-2 text-xs font-medium">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-success" aria-hidden />
                    Connected
                </Badge>
            </div>

            <Card className="min-h-[400px] flex-1 overflow-hidden rounded-lg border-border shadow-xs">
                {node ? (
                    <div className="h-full">
                        <DevTerminal nodeId={node.id} token={token!} />
                    </div>
                ) : (
                    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                        <AlertCircle className="mb-3 h-10 w-10 text-destructive" aria-hidden />
                        <h3 className="text-base font-semibold text-foreground">Node Not Found</h3>
                        <p className="mt-1 text-sm text-muted-foreground">Selected node is not available</p>
                    </div>
                )}
            </Card>
        </div>
    );
}
