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

export const windowsNodesApi = {
  setupIdle: (token: string, nodeId: number) =>
    api.post<SetupIdleResponse>(
      `/api/v1/developer/nodes/${nodeId}/setup-idle`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    ),

  switchOs: (token: string, nodeId: number) =>
    api.post<SwitchOsResponse>(
      `/api/v1/developer/nodes/${nodeId}/switch-os`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    ),
};
