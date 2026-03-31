import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import 'xterm/css/xterm.css';
import { RefreshCw, Terminal as TerminalIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface DevTerminalProps {
    nodeId: number | null;
    token: string;
}

export function DevTerminal({ nodeId, token }: DevTerminalProps) {
    const terminalRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const isConnected = useRef(false);
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        if (!terminalRef.current || !nodeId) return;

        setStatus('connecting');
        setErrorMessage('');
        isConnected.current = false;

        const term = new Terminal({
            cursorBlink: true,
            theme: {
                background: '#1e1e1e',
                foreground: '#d4d4d4',
                cursor: '#ffffff',
                cursorAccent: '#1e1e1e',
            },
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 14,
            cursorStyle: 'block',
            scrollback: 5000,
        });
        
        term.open(terminalRef.current);
        xtermRef.current = term;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = import.meta.env.VITE_API_URL 
            ? import.meta.env.VITE_API_URL.replace(/^http/, 'ws').replace(/\/$/, '')
            : `${protocol}//${window.location.hostname}:8000`;
            
        const wsUrl = `${host}/api/v1/developer/nodes/${nodeId}/terminal?token=${token}`;
        
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            isConnected.current = true;
            setStatus('connected');
            term.writeln('\x1b[32m✓ Connected to SSH\x1b[0m');
            term.writeln('');
            ws.send(JSON.stringify({ type: 'resize', rows: term.rows, cols: term.cols }));
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'output') {
                    term.write(data.data);
                } else if (data.type === 'error') {
                    term.writeln(`\x1b[31mError: ${data.message}\x1b[0m`);
                }
            } catch {
                term.write(event.data);
            }
        };

        ws.onerror = () => {
            setStatus('error');
            setErrorMessage('Connection error');
        };

        ws.onclose = (event) => {
            isConnected.current = false;
            if (event.code === 1000) {
                setStatus('disconnected');
                term.writeln('\x1b[33mDisconnected\x1b[0m');
            } else {
                setStatus('error');
                setErrorMessage(`Connection closed (Code: ${event.code})`);
                term.writeln(`\x1b[31mDisconnected: ${event.reason || 'Unknown error'}\x1b[0m`);
            }
        };

        term.onData((data) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'input', data }));
            }
        });

        term.onResize(({ rows, cols }) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'resize', rows, cols }));
            }
        });

        const timeout = setTimeout(() => {
            if (!isConnected.current && status === 'connecting') {
                setStatus('error');
                setErrorMessage('Connection timeout');
            }
        }, 10000);

        return () => {
            clearTimeout(timeout);
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close(1000, 'Component unmounting');
            }
            term.dispose();
        };
    }, [nodeId, token]);

    const handleReconnect = () => {
        window.location.reload();
    };

    if (!nodeId) {
        return (
            <Card className="h-full flex items-center justify-center bg-gray-50 border-gray-200">
                <div className="text-center p-8">
                    <TerminalIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-700 mb-2">No Node Selected</h3>
                    <p className="text-sm text-gray-500">Select a node from Admin Tools to start a terminal session</p>
                </div>
            </Card>
        );
    }

    return (
        <div className="h-full w-full flex flex-col bg-gray-900 rounded-lg overflow-hidden">
            {/* Status Bar */}
            <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
                <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${
                        status === 'connected' ? 'bg-green-500' : 
                        status === 'connecting' ? 'bg-yellow-500 animate-pulse' : 
                        'bg-red-500'
                    }`} />
                    <span className="text-sm text-gray-300 capitalize">{status}</span>
                </div>
                {(status === 'error' || status === 'disconnected') && (
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={handleReconnect}
                        className="text-gray-300 hover:text-white hover:bg-gray-700"
                    >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Reconnect
                    </Button>
                )}
            </div>
            
            {/* Terminal */}
            <div 
                ref={terminalRef} 
                className="flex-1 p-2"
            />
        </div>
    );
}
