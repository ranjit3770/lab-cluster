import api from '@/lib/api';

export interface ClusterTaskStatus {
    task_id: string;
    status: string;
    started_at?: string;
    completed_at?: string;
    return_code?: number;
    message: string;
}

export interface ClusterTaskLogs {
    task_id: string;
    stdout: string;
    stderr: string;
}

export interface ClusterTaskSummary {
    task_id: string;
    status: string;
    started_at?: string;
    completed_at?: string;
    return_code?: number;
}

export interface AppendNodeRequest {
    node_ip: string;
    node_name: string;
    ssh_port?: number;
    ssh_user?: string;
    ssh_password?: string;
    node_os?: string;
}

export const clusterManageApi = {
    runSetup: (token: string) =>
        api.post<ClusterTaskStatus>(
            '/api/v1/cluster-manage/setup',
            {},
            { headers: { Authorization: `Bearer ${token}` } }
        ),

    runAppend: (token: string, data: AppendNodeRequest) =>
        api.post<ClusterTaskStatus>(
            '/api/v1/cluster-manage/append',
            data,
            { headers: { Authorization: `Bearer ${token}` } }
        ),

    getStatus: (token: string, taskId: string) =>
        api.get<ClusterTaskStatus>(
            `/api/v1/cluster-manage/status/${taskId}`,
            { headers: { Authorization: `Bearer ${token}` } }
        ),

    getLogs: (token: string, taskId: string) =>
        api.get<ClusterTaskLogs>(
            `/api/v1/cluster-manage/logs/${taskId}`,
            { headers: { Authorization: `Bearer ${token}` } }
        ),

    listHistory: (token: string) =>
        api.get<ClusterTaskSummary[]>(
            '/api/v1/cluster-manage/history',
            { headers: { Authorization: `Bearer ${token}` } }
        ),
};
