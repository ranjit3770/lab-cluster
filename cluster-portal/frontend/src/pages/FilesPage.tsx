import {
    Files,
    Upload,
    Search,
    FileText,
    Download,
    Trash2,
    Folder,
    X,
    Menu,
    FolderPlus,
    FilePlus,
    Plus,
    ChevronDown,
    ChevronRight,
    Terminal,
    Database,
    RefreshCcw,
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
import { Badge } from "@/components/ui/badge";
import PageLoader from "@/components/PageLoader";
import { EmptyState } from "@/components/shared/EmptyState";
import { filesApi } from "@/api/files";
import type { FileEntry, StorageStats } from "@/api/types";
import { apiErrorMessage } from "@/api/errors";
import { userApi } from "@/api/user";
import { useAuth } from '@/context/useAuth'
import { toast } from "sonner";


const EXCLUDED_FOLDERS = new Set([
  'venv', '.venv', 'env', '.env', 'bin', 'lib', 'include', 
  'Lib', 'Scripts', 'site-packages', 'jobs', '__pycache__', '.git', 
  'slurm_logs'
]);

const isExcluded = (name: string) => EXCLUDED_FOLDERS.has(name);

interface DataTreeItemProps {
    folder: FileEntry;
    path: string;
    token: string | null;
    activePath: string;
    setPath: (path: string) => void;
}

const DataTreeItem = ({ folder, path, token, activePath, setPath }: DataTreeItemProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [children, setChildren] = useState<FileEntry[]>([]);
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
        if (!token) return;
        setLoading(true);
        try {
            const res = await filesApi.listFiles(token, fullPath);
            const foldersOnly = res.data.filter((f) => f.isFolder && !isExcluded(f.name));
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
                    "mb-0.5 flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors",
                    isActive 
                        ? "bg-primary/10 text-primary" 
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
            >
                <div onClick={handleToggle} className={cn("rounded p-1 hover:bg-accent", isActive && "hover:bg-primary/20")}>
                    {loading ? (
                        <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
                    ) : (
                        isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
                    )}
                </div>
                <Folder className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                <span className="flex-1 truncate">{folder.name}</span>
            </div>
            
            {isOpen && hasCheckedChildren && children.length > 0 && (
                <div className="ml-4 mt-1 space-y-0.5 border-l border-border pl-2">
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
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState("");
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<StorageStats | null>(null);
    const [rootFolders, setRootFolders] = useState<FileEntry[]>([]);
    
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
                setRootFolders(rootRes.data.filter((f) => f.isFolder && !isExcluded(f.name)));
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

    const handleItemDoubleClick = (file: FileEntry) => {
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
                } catch (err) {
                    console.error(`Upload Error (${file.name}):`, err);
                    lastError = apiErrorMessage(err, "Upload failed.");
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
        <div className="flex h-[calc(100vh-140px)] flex-col gap-4 lg:flex-row">
            
            <aside className={cn(
                "fixed z-50 flex h-full w-full shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xs transition-all duration-300 lg:relative lg:w-72",
                isSidebarOpen ? "translate-x-0 inset-0 lg:inset-auto" : "-translate-x-full lg:translate-x-0"
            )}>
                <div className="border-b border-border p-3">
                    <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
                                <Database className="h-4 w-4 text-primary" aria-hidden />
                            </span>
                            <span className="text-sm font-semibold text-foreground">Folders</span>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden" onClick={() => setIsSidebarOpen(false)} aria-label="Close folders panel">
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                    
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-full text-xs"
                        onClick={() => navigate(`/editor/root?dir=${encodeURIComponent(path)}`)}
                    >
                        <Terminal className="h-3.5 w-3.5" />
                        Open in Editor
                    </Button>
                </div>

                <div className="custom-scrollbar flex-1 overflow-y-auto p-2">
                    <button
                        onClick={() => { setPath(""); setIsSidebarOpen(false); }}
                        className={cn(
                            "mb-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors",
                            path === "" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
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
                    <div className="border-t border-border bg-muted/50 p-3">
                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Storage Used</span>
                            <span className="text-xs font-medium tabular-nums text-foreground">{Math.min(100, Math.round((stats.storage_used_gb / stats.storage_limit_gb) * 100))}%</span>
                        </div>
                        <div
                            role="progressbar"
                            aria-label="Storage used"
                            aria-valuenow={Math.min(100, Math.round((stats.storage_used_gb / stats.storage_limit_gb) * 100))}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                        >
                            <div
                                className="h-full rounded-full bg-primary transition-all"
                                style={{ width: `${Math.min(100, (stats.storage_used_gb / stats.storage_limit_gb) * 100)}%` }}
                            />
                        </div>
                        <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">{stats.storage_used_gb.toFixed(2)} / {stats.storage_limit_gb} GB</p>
                    </div>
                )}
            </aside>

            <main className="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xs">
                <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 lg:hidden" onClick={() => setIsSidebarOpen(true)} aria-label="Open folders panel">
                            <Menu className="h-4 w-4" />
                        </Button>
                        <div className="flex min-w-0 flex-col">
                            <h1 className="truncate text-sm font-semibold text-foreground">{activeFolderName}</h1>
                            <div className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                                <span onClick={() => setPath("")} className="cursor-pointer hover:text-primary">Root</span>
                                {path.split('/').filter(Boolean).map((p, idx, arr) => (
                                    <span key={p} className="flex items-center gap-1">
                                        <ChevronRight className="h-3 w-3 text-muted-foreground/40" aria-hidden />
                                        <span
                                            onClick={() => setPath(arr.slice(0, idx + 1).join('/'))}
                                            className={cn(
                                                idx === arr.length - 1 ? "font-medium text-foreground" : "cursor-pointer hover:text-primary"
                                            )}
                                        >
                                            {p}
                                        </span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                        <div className="relative hidden md:block">
                            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                            <Input
                                placeholder="Search..."
                                className="h-8 w-40 pl-8 text-xs"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                aria-label="Search files"
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
                                <Upload className="h-3.5 w-3.5" />
                                Upload
                            </Button>
                        </div>

                        <div className="relative">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8"
                                aria-expanded={createMenuOpen}
                                onClick={() => setCreateMenuOpen(!createMenuOpen)}
                            >
                                <Plus className="h-3.5 w-3.5" />
                                Create
                            </Button>
                            {createMenuOpen && (
                                <div className="absolute right-0 top-full z-10 mt-1 min-w-[140px] overflow-hidden rounded-md border border-border bg-popover py-1 shadow-md">
                                    <button
                                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-popover-foreground hover:bg-accent"
                                        onClick={() => {
                                            setCreateFolderDialog({ open: true, name: "" });
                                            setCreateMenuOpen(false);
                                        }}
                                    >
                                        <FolderPlus className="h-3.5 w-3.5" /> New Folder
                                    </button>
                                    <button
                                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-popover-foreground hover:bg-accent"
                                        onClick={() => {
                                            navigate(`/editor/new?dir=${encodeURIComponent(path)}`);
                                            setCreateMenuOpen(false);
                                        }}
                                    >
                                        <FilePlus className="h-3.5 w-3.5" /> New File
                                    </button>
                                </div>
                            )}
                        </div>

                        <Button variant="outline" size="sm" className="h-8 px-2" onClick={fetchFiles} aria-label="Refresh files">
                            <RefreshCcw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                        </Button>
                    </div>
                </header>

                {selectedFiles.size > 0 && (
                    <div className="flex h-10 shrink-0 items-center justify-between border-b border-primary/20 bg-primary/5 px-4">
                        <span className="text-xs font-medium text-primary">{selectedFiles.size} selected</span>
                        <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleDownload}>
                                <Download className="h-3.5 w-3.5" /> Download
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={handleDelete}>
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedFiles(new Set())}>
                                <X className="h-3.5 w-3.5" /> Clear
                            </Button>
                        </div>
                    </div>
                )}

                <div className="custom-scrollbar flex-1 overflow-auto">
                    {loading ? (
                        <div className="flex h-full items-center justify-center">
                            <PageLoader message="Loading files..." />
                        </div>
                    ) : displayFiles.length === 0 ? (
                        <div className="flex h-full items-center justify-center p-6">
                            <EmptyState
                                icon={Files}
                                title="No files found"
                                description="This folder is empty or no items match your search."
                            />
                        </div>
                    ) : (
                        <table className="w-full text-left">
                            <thead className="sticky top-0 z-[1] border-b border-border bg-muted">
                                <tr>
                                    <th className="w-8 px-3 py-2.5">
                                        <input
                                            type="checkbox"
                                            checked={selectedFiles.size === displayFiles.length && displayFiles.length > 0}
                                            onChange={selectAll}
                                            className="h-3.5 w-3.5 accent-primary"
                                            aria-label="Select all files"
                                        />
                                    </th>
                                    <th className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Name</th>
                                    <th className="w-20 px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Type</th>
                                    <th className="w-20 px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {displayFiles.map((file) => (
                                    <tr
                                        key={file.name}
                                        className={cn(
                                            "cursor-pointer transition-colors hover:bg-accent/40",
                                            selectedFiles.has(file.name) && "bg-primary/5"
                                        )}
                                        onClick={(e) => toggleFileSelection(file.name, e)}
                                        onDoubleClick={() => handleItemDoubleClick(file)}
                                    >
                                        <td className="px-3 py-2">
                                            <input
                                                type="checkbox"
                                                checked={selectedFiles.has(file.name)}
                                                onChange={() => {}}
                                                onClick={(e) => e.stopPropagation()}
                                                className="h-3.5 w-3.5 accent-primary"
                                                aria-label={`Select ${file.name}`}
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="flex items-center gap-2">
                                                {file.isFolder ? (
                                                    <Folder className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                                                ) : (
                                                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                                                )}
                                                <span className="truncate text-sm text-foreground">{file.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2">
                                            <Badge variant="outline" size="sm">
                                                {file.isFolder ? "Folder" : file.type || "File"}
                                            </Badge>
                                        </td>
                                        <td className="px-3 py-2">
                                            {!file.isFolder && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 px-1.5"
                                                    aria-label={`Download ${file.name}`}
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
                                                    <Download className="h-3.5 w-3.5" />
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 px-1.5"
                                                aria-label={`Rename ${file.name}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setRenameDialog({
                                                        open: true,
                                                        path: path ? `${path}/${file.name}` : file.name,
                                                        name: file.name
                                                    });
                                                }}
                                            >
                                                <Edit2 className="h-3.5 w-3.5" />
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
                        <AlertDialogAction onClick={executeDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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
