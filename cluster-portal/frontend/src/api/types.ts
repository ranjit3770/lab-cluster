/**
 * Shared API payload/response types for the portal frontend.
 */

export type UserRole = 'admin' | 'user' | 'developer';

export interface UserPayload {
    full_name?: string;
    username: string;
    email: string;
    password?: string;
    role: UserRole;
    is_active: boolean;
    cpu_limit: number;
    memory_limit_gb: number;
    storage_limit_gb: number;
}

export interface SystemSetting {
    key: string;
    value: string;
}

export interface MaintenanceIP {
    id: number;
    ip_address: string;
    label?: string | null;
}

export interface JobSubmitPayload {
    job_name: string;
    script_path: string;
    walltime?: string;
    total_cpu?: number;
    total_ram?: number;
    [key: string]: unknown;
}

export interface StorageRequestPayload {
    request_type: string;
    cpu_cores: number;
    ram_gb: number;
    storage_gb: number;
}

export interface StorageRequestStatus {
    status: string;
}

export interface FileEntry {
    name: string;
    isFolder: boolean;
    path?: string;
    size?: number | string;
    type?: string;
    modified?: string;
}

export interface PlatformConfig {
    slurm_rest_url: string;
    slurm_node_api: string;
    external_job_api_url: string;
    slurm_version: string;
    slurm_user: string;
    slurm_jwt_user: string;
    slurm_path: string;
    slurm_lib_path: string;
    cluster_name: string;
    cluster_description: string;
    session_timeout_seconds: number;
    sync_interval_ms: number;
    max_batch_jobs_per_user: number;
    max_jupyter_jobs_per_user: number;
}

export interface IntegrityCheck {
    status: 'healthy' | 'unhealthy';
    [key: string]: unknown;
}

export type IntegrityReport = Record<string, IntegrityCheck>;

export interface StorageStats {
    storage_used_gb: number;
    storage_limit_gb: number;
}
