import { useState } from 'react';
import { 
    Send, Bug, 
    Star, Layout, Gauge, 
    Shield, Folder, Cpu, Info,
    Terminal,
    Globe,
    Zap,
    Box,
    Layers,
    Monitor,
    ChevronRight,
    ArrowRight,
    MessageSquare,
    Signal,
    Command,
    Sparkles,
    Database,
    Network,
    RefreshCcw,
    Activity,
    Orbit,
    Power,
    History,
    Scan,
    ArrowUpRight,
    Cpu as CpuIcon,
    Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { feedbackApi } from "@/api/feedback";
import { useAuth } from "@/context/AuthContext";

const FEEDBACK_TYPES = [
    { id: 'bug', label: 'Bug Report', icon: Bug, color: 'text-rose-500' },
    { id: 'feature', label: 'Feature', icon: Star, color: 'text-amber-500' },
    { id: 'performance', label: 'Performance', icon: Gauge, color: 'text-emerald-500' },
    { id: 'other', label: 'Other', icon: Info, color: 'text-blue-500' }
];

const CATEGORIES = [
    { id: 'UI/UX', label: 'UI & Experience', icon: Layout },
    { id: 'Jobs', label: 'Job Execution', icon: Cpu },
    { id: 'Storage', label: 'Files & Storage', icon: Folder },
    { id: 'Security', label: 'Security & Access', icon: Shield },
];

export default function FeedbackPage() {
    const { token } = useAuth();
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        type: 'bug',
        subject: '',
        category: 'UI/UX',
        message: ''
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.subject || !formData.message) {
            toast.error("Please fill in all required fields.");
            return;
        }

        try {
            setSubmitting(true);
            await feedbackApi.submitFeedback(token!, formData);
            toast.success("Feedback submitted successfully.");
            setFormData({
                type: 'bug',
                subject: '',
                category: 'UI/UX',
                message: ''
            });
        } catch (err) {
            toast.error("Failed to submit feedback.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col gap-4 pb-4 max-w-[1200px] mx-auto w-full animate-in fade-in duration-300">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                    <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Feedback</h1>
                    <p className="text-xs text-gray-500 flex items-center gap-2 mt-1">
                        <MessageSquare className="h-3 w-3" />
                        Submit bug reports, feature requests, or suggestions
                    </p>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-1 gap-4">
                <Card className="bg-white border-gray-200 min-h-[400px]">
                    <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-sm font-semibold text-gray-900">Submit Feedback</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 overflow-visible">
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <Label className="text-[10px] font-medium text-gray-500 uppercase mb-2 block">Type</Label>
                                <div className="grid grid-cols-4 gap-2">
                                    {FEEDBACK_TYPES.map((type) => (
                                        <button
                                            key={type.id}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, type: type.id })}
                                            className={cn(
                                                "p-2 rounded-lg border text-xs font-medium transition-all flex flex-col items-center gap-1",
                                                formData.type === type.id 
                                                    ? "bg-primary/10 border-primary text-primary" 
                                                    : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                                            )}
                                        >
                                            <type.icon className="h-4 w-4" />
                                            <span className="text-[10px]">{type.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <Label className="text-[10px] font-medium text-gray-500 uppercase mb-2 block">Category</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    {CATEGORIES.map((cat) => (
                                        <button
                                            key={cat.id}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, category: cat.id })}
                                            className={cn(
                                                "p-2 rounded-lg border text-xs font-medium transition-all flex items-center gap-2",
                                                formData.category === cat.id 
                                                    ? "bg-primary/10 border-primary text-primary" 
                                                    : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                                            )}
                                        >
                                            <cat.icon className="h-3 w-3" />
                                            {cat.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <Label className="text-[10px] font-medium text-gray-500 uppercase mb-2 block">Subject</Label>
                                <Input 
                                    placeholder="Brief summary of your feedback"
                                    className="h-10 bg-gray-50 border-gray-200"
                                    value={formData.subject}
                                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                                    required
                                />
                            </div>

                            <div>
                                <Label className="text-[10px] font-medium text-gray-500 uppercase mb-2 block">Message</Label>
                                <Textarea 
                                    placeholder="Describe your feedback in detail..."
                                    className="min-h-[120px] bg-gray-50 border-gray-200 resize-none"
                                    value={formData.message}
                                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="pt-2">
                                <Button 
                                    type="submit"
                                    disabled={submitting}
                                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                                >
                                    {submitting ? (
                                        <RefreshCcw className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Send className="mr-2 h-4 w-4" />
                                    )}
                                    {submitting ? 'Submitting...' : 'Submit Feedback'}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
