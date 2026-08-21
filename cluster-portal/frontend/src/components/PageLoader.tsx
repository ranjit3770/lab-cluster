import { Loader2 } from "lucide-react";

export default function PageLoader({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] gap-4">
      <div className="relative">
        <Loader2 className="h-10 w-10 text-primary animate-spin" />
        <div className="absolute inset-0 bg-primary/10 blur-xl rounded-full" />
      </div>
      <p className="text-sm text-gray-500 uppercase tracking-widest font-medium animate-pulse">
        {message}
      </p>
    </div>
  );
}
