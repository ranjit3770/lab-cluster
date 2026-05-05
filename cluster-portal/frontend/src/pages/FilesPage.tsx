import { 
    Files, 
    Upload, 
    Search, 
    FileText, 
    HardDrive, 
    Download, 
    Trash2, 
    Folder,
    Check,
    X,
    Menu,
    Code,
    AlertCircle,
    FolderPlus,
    FilePlus,
    Plus,
    ChevronDown,
    ChevronRight,
    SearchX,
    Database,
    Zap,
    Layers,
    Terminal,
    LayoutGrid,
    RefreshCcw,
    FileJson,
    Trash,
    Scan,
    ArrowRight,
    ArrowUpRight,
    Command,
    Info,
    Signal,
    Activity,
    Orbit,
    Power,
    History,
    Network,
    Globe,
    Loader2,
    Lock,
    Unlock,
    ShieldCheck,
    Edit2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { filesApi } from "@/api/files";
import { userApi } from "@/api/user";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

interface FileItem {
    name: string;
    isFolder: boolean;
    size: string;
    type: string;
    modified: string;
}

const EXCLUDED_FOLDERS = new Set([
  'venv', '.venv', 'env', '.env', 'bin', 'lib', 'include', 
  'Lib', 'Scripts', 'site-packages', 'jobs', '__pycache__', '.git', 
  'slurm_logs'
]);

const isExcluded = (name: string) => EXCLUDED_FOLDERS.has(name);

const DataTreeItem = ({ folder, path, token, activePath, setPath }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    const [children, setChildren] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasCheckedChildren, setHasCheckedChildren] = useState(false);
    
    const fullPath = path ? `${path}/${folder.name}` : folder.name;
    const isActive = activePath === fullPath;

    useEffect(() => {
        if (activePath.startsWith(fullPath)) {
            setIsOpen(true);
            if (!hasCheckedChildren) fetchChildren();
        }
    }, [activePath]);

    const fetchChildren = async () => {
        setLoading(true);
        try {
            const res = await filesApi.listFiles(token, fullPath);
            const foldersOnly = res.data.filter((f: any) => f.isFolder && !isExcluded(f.name));
            setChildren(foldersOnly);
            setHasCheckedChildren(true);
        } catch (err) {
            console.error("Hierarchy Load Error:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isOpen && !hasCheckedChildren) {
            await fetchChildren();
        }
        setIsOpen(!isOpen);
    };

    const handleSelect = () => {
        setPath(fullPath);
    };

    return (
        <div className="select-none">
            <div 
                onClick={handleSelect}
                className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer mb-1",
                    isActive 
                        ? "bg-primary/10 text-primary" 
                        : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                )}
            >
                <div onClick={handleToggle} className={cn("p-1 rounded hover:bg-gray-200", isActive ? "hover:bg-primary/20" : "")}>
                    {loading ? (
                        <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
                    ) : (
                        isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
                    )}
                </div>
                <Folder className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-gray-400")} />
                <span className="truncate flex-1">{folder.name}</span>
            </div>
            
            {isOpen && hasCheckedChildren && children.length > 0 && (
                <div className="ml-4 pl-2 border-l border-gray-200 mt-1 space-y-0.5">
                    {children.map(child => (
                        <DataTreeItem 
                            key={child.name} 
                            folder={child} 
                            path={fullPath} 
                            token={token} 
                            activePath={activePath} 
                            setPath={setPath}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default function FilesPage() {
    const navigate = useNavigate();
    const { token } = useAuth();
    const [path, setPath] = useState("");
    const [files, setFiles] = useState<FileItem[]>([]);
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState("");
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<any>(null);
    const [rootFolders, setRootFolders] = useState<FileItem[]>([]);
    
    const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; multi: boolean }>({ open: false, multi: false });
    const [createFolderDialog, setCreateFolderDialog] = useState({ open: false, name: "" });
    const [renameDialog, setRenameDialog] = useState({ open: false, path: "", name: "" });
    const [createMenuOpen, setCreateMenuOpen] = useState(false);

    const fetchFiles = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await filesApi.listFiles(token, path);
            setFiles(res.data);
            
            if (rootFolders.length === 0 || path === "") {
                const rootRes = await filesApi.listFiles(token, "");
                setRootFolders(rootRes.data.filter((f: any) => f.isFolder && !isExcluded(f.name)));
            }

            const statsRes = await userApi.getDashboardStats(token);
            setStats(statsRes.data);
        } catch (err) {
            console.error("Storage Error:", err);
            toast.error("Failed to load files.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFiles();
        setSelectedFiles(new Set());
    }, [path, token]);

    const displayFiles = useMemo(() => {
        let filtered = files;
        filtered = filtered.filter(f => !isExcluded(f.name));

        if (searchQuery) {
            return filtered.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));
        }
        return filtered;
    }, [files, searchQuery]);

    const activeFolderName = useMemo(() => {
        if (!path) return "Root";
        return path.split('/').pop() || "Folder";
    }, [path]);

    const toggleFileSelection = (name: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newSet = new Set(selectedFiles);
        if (newSet.has(name)) newSet.delete(name);
        else newSet.add(name);
        setSelectedFiles(newSet);
    };

    const handleItemDoubleClick = (file: FileItem) => {
        if (file.isFolder) {
            setPath(path ? `${path}/${file.name}` : file.name);
        } else {
            const filePath = path ? `${path}/${file.name}` : file.name;
            navigate(`/editor/${encodeURIComponent(filePath)}`);
        }
    };

    const selectAll = () => {
        if (selectedFiles.size === displayFiles.length) {
            setSelectedFiles(new Set());
        } else {
            setSelectedFiles(new Set(displayFiles.map(f => f.name)));
        }
    };

    const handleDelete = () => {
        setConfirmDelete({ open: true, multi: false });
    };

    const executeDelete = async () => {
        if (!token) return;
        try {
            for (const name of selectedFiles) {
                const target = path ? `${path}/${name}` : name;
                await filesApi.deleteFile(token, target);
            }
            fetchFiles();
            setSelectedFiles(new Set());
            toast.success("Files deleted successfully.");
        } catch (err) {
            console.error("Delete Error:", err);
            toast.error("Failed to delete files.");
        } finally {
            setConfirmDelete({ open: false, multi: false });
        }
    };

    const handleDownload = async () => {
        if (!token) return;
        try {
            const targets = Array.from(selectedFiles);
            for (const name of targets) {
                const target = path ? `${path}/${name}` : name;
                const res = await filesApi.downloadFile(token, target);
                
                const blob = await res.data.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = name;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }
            setSelectedFiles(new Set());
            toast.success("Download started.");
        } catch (err) {
            console.error("Download Error:", err);
            toast.error("Failed to download files.");
        }
    };

    const handleCreateFolder = async () => {
        if (!token || !createFolderDialog.name) return;
        try {
            const fullPath = path ? `${path}/${createFolderDialog.name}` : createFolderDialog.name;
            await filesApi.createFolder(token, fullPath);
            fetchFiles();
            setCreateFolderDialog({ open: false, name: "" });
            toast.success("Folder created successfully.");
        } catch (err) {
            console.error("Folder Error:", err);
            toast.error("Failed to create folder.");
        }
    };
    const handleRename = async () => {
        if (!token || !renameDialog.name) return;
        try {
            await filesApi.renameFile(token, renameDialog.path, renameDialog.name);
            fetchFiles();
            setRenameDialog({ open: false, path: "", name: "" });
            toast.success("Renamed successfully.");
        } catch (err) {
            console.error("Rename Error:", err);
            toast.error("Failed to rename.");
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const filesToUpload = e.target.files;
        if (!filesToUpload || filesToUpload.length === 0 || !token) return;

        setLoading(true);
        let successCount = 0;
        let lastError = "";

        try {
            for (let i = 0; i < filesToUpload.length; i++) {
                const file = filesToUpload[i];
                try {
                    await filesApi.uploadFile(token, path, file);
                    successCount++;
                } catch (err: any) {
                    console.error(`Upload Error (${file.name}):`, err);
                    lastError = err.response?.data?.detail || "Upload failed.";
                }
            }
            
            fetchFiles();
            
            if (successCount === filesToUpload.length) {
                toast.success(`${successCount} file(s) uploaded.`);
            } else {
                toast.error(`Partial upload: ${successCount}/${filesToUpload.length}. ${lastError}`);
            }
        } finally {
            setLoading(false);
            e.target.value = '';
        }
    };

    return (
        <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-140px)] animate-in fade-in duration-300">
            
            <aside className={cn(
                "w-full lg:w-72 flex flex-col bg-white border border-gray-200 rounded-xl shrink-0 transition-all duration-300 z-50 fixed lg:relative h-full overflow-hidden",
                isSidebarOpen ? "translate-x-0 inset-0 lg:inset-auto" : "-translate-x-full lg:translate-x-0"
            )}>
                <div className="p-4 border-b border-gray-200">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-primary/10 rounded-lg">
                                <Database className="h-4 w-4 text-primary" />
                            </div>
                            <span className="text-sm font-semibold text-gray-900">Folders</span>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden" onClick={() => setIsSidebarOpen(false)}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                    
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full h-8 text-xs"
                        onClick={() => navigate(`/editor/root?dir=${encodeURIComponent(path)}`)}
                    >
                        <Terminal className="h-3 w-3 mr-2" />
                        Open in Editor
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    <button 
                        onClick={() => { setPath(""); setIsSidebarOpen(false); }}
                        className={cn(
                            "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all mb-1",
                            path === "" ? "bg-primary/10 text-primary" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                        )}
                    >
                        <Files className="h-4 w-4" /> 
                        Root
                    </button>

                    <div className="space-y-0.5">
                        {rootFolders.map(folder => (
                            <DataTreeItem 
                                key={folder.name} 
                                folder={folder} 
                                path="" 
                                token={token} 
                                activePath={path} 
                                setPath={(p: string) => { setPath(p); setIsSidebarOpen(false); }}
                            />
                        ))}
                    </div>
                </div>

                {stats && (
                    <div className="p-4 border-t border-gray-200 bg-gray-50">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-medium text-gray-500 uppercase">Storage Used</span>
                            <span className="text-xs font-medium text-gray-900">{Math.min(100, Math.round((stats.storage_used_gb / stats.storage_limit_gb) * 100))}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-primary rounded-full" 
                                style={{ width: `${Math.min(100, (stats.storage_used_gb / stats.storage_limit_gb) * 100)}%` }}
                            />
                        </div>
                        <p className="text-[9px] text-gray-400 mt-1">{stats.storage_used_gb.toFixed(2)} / {stats.storage_limit_gb} GB</p>
                    </div>
                )}
            </aside>

            <main className="flex-1 flex flex-col bg-white border border-gray-200 rounded-xl overflow-hidden">
                <header className="h-14 px-4 flex items-center justify-between border-b border-gray-200 shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <Button variant="ghost" size="icon" className="h-9 w-9 lg:hidden" onClick={() => setIsSidebarOpen(true)}>
                            <Menu className="h-4 w-4" />
                        </Button>
                        <div className="flex flex-col min-w-0">
                            <h1 className="text-base font-semibold text-gray-900 truncate">{activeFolderName}</h1>
                            <div className="flex items-center gap-1 text-[10px] text-gray-500">
                                <span onClick={() => setPath("")} className="hover:text-primary cursor-pointer">Root</span>
                                {path.split('/').filter(Boolean).map((p, idx, arr) => (
                                    <span key={p} className="flex items-center gap-1">
                                        <ChevronRight className="h-3 w-3 text-gray-300" />
                                        <span 
                                            onClick={() => setPath(arr.slice(0, idx + 1).join('/'))}
                                            className={cn(
                                                idx === arr.length - 1 ? "text-gray-900 font-medium" : "hover:text-primary cursor-pointer"
                                            )}
                                        >
                                            {p}
                                        </span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="relative hidden md:block">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                            <Input 
                                placeholder="Search..." 
                                className="pl-8 h-8 w-40 bg-gray-50 border-gray-200 rounded-lg text-xs"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        
                        <div className="relative">
                            <input
                                type="file"
                                id="file-upload"
                                multiple
                                className="hidden"
                                onChange={handleFileUpload}
                            />
                            <Button variant="outline" size="sm" className="h-8" onClick={() => document.getElementById('file-upload')?.click()}>
                                <Upload className="h-3 w-3 mr-1" />
                                Upload
                            </Button>
                        </div>

                        <div className="relative">
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8"
                                onClick={() => setCreateMenuOpen(!createMenuOpen)}
                            >
                                <Plus className="h-3 w-3 mr-1" />
                                Create
                            </Button>
                            {createMenuOpen && (
                                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 min-w-[140px]">
                                    <button 
                                        className="w-full px-3 py-2 text-xs text-left hover:bg-gray-50 flex items-center gap-2"
                                        onClick={() => {
                                            setCreateFolderDialog({ open: true, name: "" });
                                            setCreateMenuOpen(false);
                                        }}
                                    >
                                        <FolderPlus className="h-3 w-3" /> New Folder
                                    </button>
                                    <button 
                                        className="w-full px-3 py-2 text-xs text-left hover:bg-gray-50 flex items-center gap-2"
                                        onClick={() => {
                                            navigate(`/editor/new?dir=${encodeURIComponent(path)}`);
                                            setCreateMenuOpen(false);
                                        }}
                                    >
                                        <FilePlus className="h-3 w-3" /> New File
                                    </button>
                                </div>
                            )}
                        </div>

                        <Button variant="outline" size="sm" className="h-8" onClick={fetchFiles}>
                            <RefreshCcw className={cn("h-3 w-3", loading && "animate-spin")} />
                        </Button>
                    </div>
                </header>

                {selectedFiles.size > 0 && (
                    <div className="h-10 px-4 flex items-center justify-between bg-primary/5 border-b border-primary/20">
                        <span className="text-xs font-medium text-primary">{selectedFiles.size} selected</span>
                        <div className="flex items-center gap-2">
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleDownload}>
                                <Download className="h-3 w-3 mr-1" /> Download
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50" onClick={handleDelete}>
                                <Trash2 className="h-3 w-3 mr-1" /> Delete
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedFiles(new Set())}>
                                <X className="h-3 w-3 mr-1" /> Clear
                            </Button>
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-auto">
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="h-8 w-8 text-primary animate-spin" />
                        </div>
                    ) : displayFiles.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400">
                            <Files className="h-12 w-12 mb-2" />
                            <p className="text-sm">No files found</p>
                        </div>
                    ) : (
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                                <tr>
                                    <th className="px-4 py-2 w-8">
                                        <input 
                                            type="checkbox" 
                                            checked={selectedFiles.size === displayFiles.length && displayFiles.length > 0}
                                            onChange={selectAll}
                                            className="rounded border-gray-300"
                                        />
                                    </th>
                                    <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase">Name</th>
                                    <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase w-20">Type</th>
                                    <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase w-20">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {displayFiles.map((file) => (
                                    <tr 
                                        key={file.name} 
                                        className={cn(
                                            "hover:bg-gray-50 cursor-pointer transition-colors",
                                            selectedFiles.has(file.name) && "bg-primary/5"
                                        )}
                                        onClick={(e) => toggleFileSelection(file.name, e)}
                                        onDoubleClick={() => handleItemDoubleClick(file)}
                                    >
                                        <td className="px-4 py-2">
                                            <input 
                                                type="checkbox" 
                                                checked={selectedFiles.has(file.name)}
                                                onChange={() => {}}
                                                onClick={(e) => e.stopPropagation()}
                                                className="rounded border-gray-300"
                                            />
                                        </td>
                                        <td className="px-4 py-2">
                                            <div className="flex items-center gap-2">
                                                {file.isFolder ? (
                                                    <Folder className="h-4 w-4 text-primary" />
                                                ) : (
                                                    <FileText className="h-4 w-4 text-gray-400" />
                                                )}
                                                <span className="text-sm text-gray-900">{file.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2">
                                            <Badge variant="outline" className="text-[9px]">
                                                {file.isFolder ? "Folder" : file.type || "File"}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-2">
                                            {!file.isFolder && (
                                                <Button 
                                                    size="sm" 
                                                    variant="ghost" 
                                                    className="h-7 text-xs"
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        const target = path ? `${path}/${file.name}` : file.name;
                                                        const res = await filesApi.downloadFile(token!, target);
                                                        const blob = await res.data.blob();
                                                        const url = window.URL.createObjectURL(blob);
                                                        const a = document.createElement('a');
                                                        a.href = url;
                                                        a.download = file.name;
                                                        document.body.appendChild(a);
                                                        a.click();
                                                        window.URL.revokeObjectURL(url);
                                                        document.body.removeChild(a);
                                                    }}
                                                >
                                                    <Download className="h-3 w-3" />
                                                </Button>
                                            )}
                                            <Button 
                                                size="sm" 
                                                variant="ghost" 
                                                className="h-7 text-xs"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setRenameDialog({
                                                        open: true,
                                                        path: path ? `${path}/${file.name}` : file.name,
                                                        name: file.name
                                                    });
                                                }}
                                            >
                                                <Edit2 className="h-3 w-3" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </main>

            <AlertDialog open={confirmDelete.open} onOpenChange={(o) => setConfirmDelete({ ...confirmDelete, open: o })}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Files?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete {selectedFiles.size} file(s)? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={executeDelete} className="bg-rose-500 hover:bg-rose-600">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={createFolderDialog.open} onOpenChange={(o) => setCreateFolderDialog({ ...createFolderDialog, open: o })}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Create New Folder</AlertDialogTitle>
                        <AlertDialogDescription>
                            Enter a name for the new folder.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <Input 
                        value={createFolderDialog.name}
                        onChange={(e) => setCreateFolderDialog({ ...createFolderDialog, name: e.target.value })}
                        placeholder="Folder name"
                        className="mt-2"
                    />
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleCreateFolder} disabled={!createFolderDialog.name}>
                            Create
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={renameDialog.open} onOpenChange={(o) => setRenameDialog({ ...renameDialog, open: o })}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Rename {renameDialog.path.includes('/') ? 'File' : 'Object'}</AlertDialogTitle>
                        <AlertDialogDescription>
                            Enter a new name for this {renameDialog.path.includes('.') ? 'file' : 'folder'}.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <Input 
                        value={renameDialog.name}
                        onChange={(e) => setRenameDialog({ ...renameDialog, name: e.target.value })}
                        placeholder="New name"
                        className="mt-2"
                        onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                    />
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRename} disabled={!renameDialog.name}>
                            Rename
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
