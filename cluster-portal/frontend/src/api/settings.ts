import api from '@/lib/api';

export interface SystemConfiguration {
    slurm_rest_url: string;
    slurm_node_api?: string;
    external_job_api_url?: string;
    slurm_version?: string;
    slurm_user?: string;
    cluster_name?: string;
    cluster_description?: string;
    session_timeout_seconds: number;
    sync_interval_ms: number;
    max_batch_jobs_per_user?: number;
    max_jupyter_jobs_per_user?: number;
    identity_provider: string;
    mfa_enabled: boolean;
}

export interface SettingSchema {
    key: string;
    value: string;
    description: string;
}

export const settingsApi = {
    getBranding: () => api.get<{ maintenance_active: boolean, cluster_name: string, cluster_description: string }>('/api/v1/system-info/maintenance-status'),
    getConfig: (token: string) => api.get<SystemConfiguration>('/api/v1/developer/config', {
         headers: { Authorization: `Bearer ${token}` }
    }),
    updateConfig: (token: string, config: Partial<SystemConfiguration>) => api.put<SystemConfiguration>('/api/v1/developer/config', config, {
         headers: { Authorization: `Bearer ${token}` }
    }),
    getSystemSettings: (token: string) => api.get<SettingSchema[]>('/api/v1/settings', {
         headers: { Authorization: `Bearer ${token}` }
    }),
    updateSystemSetting: (token: string, key: string, value: string) => api.put(`/api/v1/settings/${key}`, null, {
         params: { value },
         headers: { Authorization: `Bearer ${token}` }
    }),
    
    // Maintenance IP Whitelist
    getMaintenanceIPs: (token: string) => api.get<any[]>('/api/v1/settings/maintenance/ips', {
         headers: { Authorization: `Bearer ${token}` }
    }),
    addMaintenanceIP: (token: string, ip: string, label?: string) => api.post('/api/v1/settings/maintenance/ips', { ip_address: ip, label }, {
         headers: { Authorization: `Bearer ${token}` }
    }),
    removeMaintenanceIP: (token: string, id: number) => api.delete(`/api/v1/settings/maintenance/ips/${id}`, {
         headers: { Authorization: `Bearer ${token}` }
    }),
    getIntegrity: (token: string) => api.get<any>('/api/v1/developer/test-integrity', {
         headers: { Authorization: `Bearer ${token}` }
    }),
}
