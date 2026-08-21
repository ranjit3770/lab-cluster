import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="min-h-screen bg-[#020202] flex items-center justify-center p-6">
                    <div className="max-w-md w-full bg-[#0a0a0a] border border-white/10 rounded-2xl p-8 shadow-2xl">
                        <div className="flex flex-col items-center text-center space-y-6">
                            <div className="h-16 w-16 bg-rose-500/10 rounded-2xl flex items-center justify-center">
                                <AlertTriangle className="h-8 w-8 text-rose-500" />
                            </div>
                            <div className="space-y-2">
                                <h1 className="text-xl font-bold text-white">Something went wrong</h1>
                                <p className="text-sm text-muted-foreground">
                                    An unexpected error occurred. Please try again or return to the dashboard.
                                </p>
                            </div>
                            <div className="flex gap-3 w-full">
                                <Button
                                    variant="outline"
                                    onClick={() => window.location.href = '/'}
                                    className="flex-1 h-10"
                                >
                                    <Home className="h-4 w-4 mr-2" />
                                    Dashboard
                                </Button>
                                <Button
                                    onClick={this.handleReset}
                                    className="flex-1 h-10 bg-white text-black hover:bg-white/90"
                                >
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                    Retry
                                </Button>
                            </div>
                            {this.state.error && (
                                <pre className="w-full text-[10px] text-muted-foreground/50 bg-white/5 p-3 rounded-lg overflow-x-auto text-left">
                                    {this.state.error.message}
                                </pre>
                            )}
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}