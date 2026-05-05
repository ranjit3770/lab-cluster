import api from '@/lib/api';

export interface DevNode {
    id: number;
    name: string;
    ip_address: string;
    ssh_port: number;
    ssh_username: string;
    ssh_password?: string;
    created_at: string;
}

export interface DevNodeCreate {
    name: string;
    ip_address: string;
    ssh_port: number;
    ssh_username: string;
    ssh_password?: string;
}

export interface DevNodeBulkCreate {
    nodes: DevNodeCreate[];
    test_connections: boolean;
}

export interface DevNodeBulkResult {
    created: DevNode[];
    skipped: string[];
    failed: string[];
}

export const devNodesApi = {
    getNodes: (token: string) => api.get<DevNode[]>('/api/v1/developer/nodes', {
         headers: { Authorization: `Bearer ${token}` }
    }),
    
    testSSH: (token: string, data: {ip_address: string, port: number, username: string, password?: string}) => 
        api.post('/api/v1/developer/nodes/test', data, {
            headers: { Authorization: `Bearer ${token}` }
        }),

    addNode: (token: string, data: DevNodeCreate) => 
        api.post('/api/v1/developer/nodes', data, {
            headers: { Authorization: `Bearer ${token}` }
        }),

    bulkAddNodes: (token: string, data: DevNodeBulkCreate) =>
        api.post<DevNodeBulkResult>('/api/v1/developer/nodes/bulk', data, {
            headers: { Authorization: `Bearer ${token}` }
        }),

    updateNode: (token: string, id: number, data: Partial<DevNodeCreate>) => 
        api.put(`/api/v1/developer/nodes/${id}`, data, {
            headers: { Authorization: `Bearer ${token}` }
        }),
    deleteNode: (token: string, id: number) => 
        api.delete(`/api/v1/developer/nodes/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
        }),
}
