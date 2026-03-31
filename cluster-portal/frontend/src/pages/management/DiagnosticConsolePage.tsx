import { 
    ChevronLeft,
    Terminal,
    Monitor,
    Loader2,
    AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useState, useEffect } from "react";
import { devNodesApi, type DevNode } from "@/api/devNodes";
import { DevTerminal } from "@/components/DevTerminal";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

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
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <div className="h-16 w-16 bg-gray-100 rounded-xl flex items-center justify-center mb-4">
                    <Monitor className="h-8 w-8 text-muted-foreground" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900">Select a Node</h2>
                <p className="text-sm text-muted-foreground mt-1 mb-4">
                    Choose a node from Admin Tools to open terminal
                </p>
                <Button 
                    onClick={() => navigate('/management/admin-tools')}
                    variant="outline"
                    size="sm"
                >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Go to Admin Tools
                </Button>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full gap-3">
                <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                <span className="text-sm text-muted-foreground">Loading...</span>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col p-4 gap-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => navigate('/management/admin-tools')}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-lg font-semibold text-gray-900">{node?.name || 'Terminal'}</h1>
                        <p className="text-xs text-muted-foreground">{node?.ip_address}</p>
                    </div>
                </div>
                <Badge variant="outline" className="text-xs">
                    <span className="h-2 w-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
                    Connected
                </Badge>
            </div>

            <Card className="flex-1 overflow-hidden border-gray-200 min-h-[400px]">
                {node ? (
                    <div className="h-full">
                        <DevTerminal nodeId={node.id} token={token!} />
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                        <AlertCircle className="h-10 w-10 text-rose-500 mb-3" />
                        <h3 className="text-base font-semibold">Node Not Found</h3>
                        <p className="text-sm text-muted-foreground">Selected node is not available</p>
                    </div>
                )}
            </Card>
        </div>
    );
}
