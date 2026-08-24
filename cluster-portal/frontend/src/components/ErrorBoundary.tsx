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
                <div className="flex min-h-screen items-center justify-center bg-background p-6">
                    <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-sm">
                        <div className="flex flex-col items-center space-y-6 text-center">
                            <div className="flex h-14 w-14 items-center justify-center rounded-md bg-destructive/10 border border-destructive/20">
                                <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden />
                            </div>
                            <div className="space-y-2">
                                <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
                                <p className="text-sm text-muted-foreground">
                                    An unexpected error occurred. Please try again or return to the dashboard.
                                </p>
                            </div>
                            <div className="flex w-full gap-3">
                                <Button
                                    variant="outline"
                                    onClick={() => window.location.href = '/'}
                                    className="h-9 flex-1"
                                >
                                    <Home className="mr-2 h-4 w-4" />
                                    Dashboard
                                </Button>
                                <Button
                                    onClick={this.handleReset}
                                    className="h-9 flex-1"
                                >
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Retry
                                </Button>
                            </div>
                            {this.state.error && (
                                <pre className="custom-scrollbar max-h-40 w-full overflow-auto rounded-md bg-muted/50 p-3 text-left font-mono text-[11px] text-muted-foreground">
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