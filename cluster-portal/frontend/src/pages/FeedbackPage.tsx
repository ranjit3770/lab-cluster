import { useState } from 'react';
import {
    Send, Bug,
    Star, Layout, Gauge,
    Shield, Folder, Cpu, Info,
    RefreshCcw,
    MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { feedbackApi } from "@/api/feedback";
import { useAuth } from '@/context/useAuth'

const FEEDBACK_TYPES = [
    { id: 'bug', label: 'Bug Report', icon: Bug },
    { id: 'feature', label: 'Feature', icon: Star },
    { id: 'performance', label: 'Performance', icon: Gauge },
    { id: 'other', label: 'Other', icon: Info }
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
        } catch {
            toast.error("Failed to submit feedback.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col pb-4 max-w-[1200px] mx-auto w-full">
            <PageHeader
                title="Feedback"
                description={
                    <span className="flex items-center gap-1.5">
                        <MessageSquare className="h-3 w-3" aria-hidden />
                        Submit bug reports, feature requests, or suggestions
                    </span>
                }
            />

            <div className="grid grid-cols-1 lg:grid-cols-1 gap-4">
                <Card>
                    <CardHeader className="border-b border-border px-4 py-3 [.border-b]:pb-3">
                        <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <Send className="h-3.5 w-3.5 text-primary" aria-hidden />
                            Submit Feedback
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 overflow-visible">
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <Label className="text-xs font-medium text-foreground">Type</Label>
                                <div className="mt-1.5 grid grid-cols-4 gap-2">
                                    {FEEDBACK_TYPES.map((type) => (
                                        <button
                                            key={type.id}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, type: type.id })}
                                            className={cn(
                                                "flex flex-col items-center gap-1 rounded-md border p-2 text-xs font-medium transition-colors",
                                                formData.type === type.id
                                                    ? "border-primary bg-primary/10 text-primary"
                                                    : "border-border bg-card text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                                            )}
                                        >
                                            <type.icon className="h-4 w-4" aria-hidden />
                                            <span className="text-[11px]">{type.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <Label className="text-xs font-medium text-foreground">Category</Label>
                                <div className="mt-1.5 grid grid-cols-2 gap-2">
                                    {CATEGORIES.map((cat) => (
                                        <button
                                            key={cat.id}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, category: cat.id })}
                                            className={cn(
                                                "flex items-center gap-2 rounded-md border p-2 text-xs font-medium transition-colors",
                                                formData.category === cat.id
                                                    ? "border-primary bg-primary/10 text-primary"
                                                    : "border-border bg-card text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                                            )}
                                        >
                                            <cat.icon className="h-3.5 w-3.5" aria-hidden />
                                            {cat.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <Label htmlFor="feedback-subject" className="text-xs font-medium text-foreground">Subject</Label>
                                <Input
                                    id="feedback-subject"
                                    placeholder="Brief summary of your feedback"
                                    className="mt-1.5 h-9"
                                    value={formData.subject}
                                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                                    required
                                />
                            </div>

                            <div>
                                <Label htmlFor="feedback-message" className="text-xs font-medium text-foreground">Message</Label>
                                <Textarea
                                    id="feedback-message"
                                    placeholder="Describe your feedback in detail..."
                                    className="mt-1.5 min-h-[120px] resize-none"
                                    value={formData.message}
                                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="pt-1">
                                <Button
                                    type="submit"
                                    disabled={submitting}
                                    className="w-full"
                                >
                                    {submitting ? (
                                        <RefreshCcw className="animate-spin" aria-hidden />
                                    ) : (
                                        <Send aria-hidden />
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
