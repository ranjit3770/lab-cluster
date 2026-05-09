import api from '@/lib/api';

export interface PlaybookResult {
  success: boolean;
  return_code: number;
  stdout: string;
  stderr: string;
}

export interface SetupIdleResponse {
  status: 'success' | 'error' | 'partial';
  step?: string;
  message: string;
  details?: {
    grub?: PlaybookResult;
    idle?: PlaybookResult;
  };
}

export interface SwitchOsResponse {
  status: 'success' | 'error';
  message: string;
  details?: PlaybookResult;
}

export interface BulkNodeResult {
  node_id: number;
  status: 'success' | 'error' | 'partial';
  step?: string;
  message: string;
  details?: PlaybookResult;
}

export interface BulkActionResponse {
  results: BulkNodeResult[];
  total: number;
  successful: number;
}

export interface PlaybookCreds {
  ansible_user?: string;
  ansible_password?: string;
}

export const windowsNodesApi = {
  setupIdle: (token: string, nodeId: number, creds?: PlaybookCreds) =>
    api.post<SetupIdleResponse>(
      `/api/v1/developer/nodes/${nodeId}/setup-idle`,
      creds || {},
      { headers: { Authorization: `Bearer ${token}` } }
    ),

  switchOs: (token: string, nodeId: number, creds?: PlaybookCreds) =>
    api.post<SwitchOsResponse>(
      `/api/v1/developer/nodes/${nodeId}/switch-os`,
      creds || {},
      { headers: { Authorization: `Bearer ${token}` } }
    ),

  bulkSetupIdle: (token: string, nodeIds: number[], creds?: PlaybookCreds) =>
    api.post<BulkActionResponse>(
      '/api/v1/developer/nodes/bulk/setup-idle',
      { node_ids: nodeIds, ...(creds || {}) },
      { headers: { Authorization: `Bearer ${token}` } }
    ),

  bulkSwitchOs: (token: string, nodeIds: number[], creds?: PlaybookCreds) =>
    api.post<BulkActionResponse>(
      '/api/v1/developer/nodes/bulk/switch-os',
      { node_ids: nodeIds, ...(creds || {}) },
      { headers: { Authorization: `Bearer ${token}` } }
    ),
};
