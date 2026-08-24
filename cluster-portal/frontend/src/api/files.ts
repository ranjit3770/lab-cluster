import api from '@/lib/api';
import type { FileEntry } from './types';

export const filesApi = {
    listFiles: (token: string, path: string = "") => 
        api.get<FileEntry[]>('/api/v1/files/list', {
            params: { path },
            headers: { Authorization: `Bearer ${token}` }
        }),
    
    uploadFile: (token: string, path: string, file: File, overwrite: boolean = true) => {
        const formData = new FormData();
        formData.append('file', file);
        return api.post('/api/v1/files/upload', formData, {
            params: { path, overwrite },
            headers: { 
                Authorization: `Bearer ${token}`,
                'Content-Type': 'multipart/form-data'
            }
        });
    },

    deleteFile: (token: string, path: string) => 
        api.delete('/api/v1/files/delete', {
            params: { path },
            headers: { Authorization: `Bearer ${token}` }
        }),

    downloadFile: (token: string, path: string) => 
        api.get('/api/v1/files/download', {
            params: { path, t: new Date().getTime() },
            responseType: 'blob',
            headers: { Authorization: `Bearer ${token}` }
        }),

    createFolder: (token: string, path: string) => 
        api.post('/api/v1/files/create-folder', null, {
            params: { path },
            headers: { Authorization: `Bearer ${token}` }
        }),

    getFileTree: (token: string) => 
        api.get('/api/v1/files/tree', {
            headers: { Authorization: `Bearer ${token}` }
        }),

    renameFile: (token: string, path: string, new_name: string) => 
        api.post('/api/v1/files/rename', null, {
            params: { path, new_name },
            headers: { Authorization: `Bearer ${token}` }
        })
};
