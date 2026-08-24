import { isAxiosError } from "axios";

/**
 * Extract a user-facing message from an unknown caught error.
 * Handles FastAPI's `{ detail: string | ValidationItem[] }` responses,
 * plain Error objects, and anything else via the fallback string.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
    if (isAxiosError(err)) {
        const data: unknown = err.response?.data;
        if (data && typeof data === "object" && "detail" in data) {
            const detail = (data as { detail?: unknown }).detail;
            if (typeof detail === "string" && detail.trim()) return detail;
            if (Array.isArray(detail)) {
                const first = detail[0] as { msg?: unknown } | undefined;
                if (first && typeof first.msg === "string") return first.msg;
            }
        }
        if (err.message) return `${fallback} (${err.message})`;
    }
    if (err instanceof Error && err.message) return `${fallback} (${err.message})`;
    return fallback;
}
