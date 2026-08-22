import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { 
    FileCode, 
    Save, 
    ChevronRight, 
    Folder,
    ChevronDown,
    ArrowLeft,
    Menu,
    X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { filesApi } from '@/api/files';
import { useAuth } from '@/context/AuthContext';
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

const EXCLUDED_FOLDERS = new Set([
  'venv', '.venv', 'env', '.env', 'bin', 'lib', 'include', 
  'Lib', 'Scripts', 'site-packages', 'jobs', '__pycache__', '.git', 
  'slurm_logs'
]);

const isExcluded = (name: string) => EXCLUDED_FOLDERS.has(name);

export default function EditorPage() {
    const { fileId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { token } = useAuth();
    
    // Extract query parameters for directory context
    const queryParams = new URLSearchParams(location.search);
    const targetDir = queryParams.get('dir') || '';
    const [content, setContent] = useState('');
    const [fileName, setFileName] = useState('No file selected');
    const [isDirty, setIsDirty] = useState(false);
    const [saveStatus, setSaveStatus] = useState('');
    const [sidebarFiles, setSidebarFiles] = useState<any[]>([]);
    const [sidebarLoading, setSidebarLoading] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const editorRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const loadFile = async () => {
            if (!token || !fileId || fileId === 'new' || fileId === 'root') {
                if (fileId === 'new') {
                    setFileName('Untitled.txt');
                    setContent('');
                    setIsDirty(true);
                } else {
                    setFileName(fileId === 'root' ? 'Workspace' : 'No file selected');
                    setContent('# Select a file from the sidebar to start editing\n');
                }
                return;
            }

            try {
                const decodedPath = decodeURIComponent(fileId);
                setFileName(decodedPath.split('/').pop() || decodedPath);
                
                const res = await filesApi.downloadFile(token, decodedPath);
                const text = await res.data.text();
                setContent(text);
                setIsDirty(false);
            } catch (err) {
                console.error("Load Error:", err);
                setContent('# Error: Failed to load file');
            }
        };

        loadFile();
    }, [fileId, token]);

    useEffect(() => {
        const fetchSidebar = async () => {
            if (!token) return;
            setSidebarLoading(true);
            try {
                const res = await filesApi.listFiles(token, '');
                setSidebarFiles(res.data.filter((f: any) => !isExcluded(f.name)));
            } catch (err) {
                console.error("Sidebar Load Error:", err);
            } finally {
                setSidebarLoading(false);
            }
        };
        fetchSidebar();
    }, [token]);

    const handleSave = async () => {
        if (!token || !fileId || fileId === 'root' || fileName === 'No file selected') return;
        
        let targetPath = fileId === 'new' ? (targetDir ? `${targetDir}/${fileName}` : fileName) : decodeURIComponent(fileId);
        
        try {
            const file = new File([content], fileName, { type: 'text/plain' });
            const dirPath = targetPath.includes('/') ? targetPath.substring(0, targetPath.lastIndexOf('/')) : '';
            
            // For 'new' file mode, we explicitly DISALLOW overwriting existing files.
            // For existing files (fileId !== 'new'), we allow overwriting (saving).
            const allowOverwrite = fileId !== 'new';
            
            await filesApi.uploadFile(token, dirPath, file, allowOverwrite);
            setIsDirty(false);
            setSaveStatus('Saved');
            
            // If it was a new file, redirect to the real path
            if (fileId === 'new') {
                navigate(`/editor/${encodeURIComponent(targetPath)}`, { replace: true });
            }
            
            setTimeout(() => setSaveStatus(''), 3000);
        } catch (err: any) {
            console.error("Save Error:", err);
            const msg = err.response?.data?.detail || 'Save failed';
            setSaveStatus(msg);
            setTimeout(() => setSaveStatus(''), 5000);
        }
    };

    const handleEditorDidMount = (editor: any, monaco: any) => {
        editorRef.current = editor;
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            handleSave();
        });
    };

    const FileTreeItem = ({ file, path, level = 0 }: { file: any; path: string; level?: number }) => {
        const [isOpen, setIsOpen] = useState(false);
        const [children, setChildren] = useState<any[]>([]);
        
        const fullPath = path ? `${path}/${file.name}` : file.name;
        const isActive = fileId === encodeURIComponent(fullPath);

        const loadChildren = async () => {
            try {
                const res = await filesApi.listFiles(token!, fullPath);
                setChildren(res.data.filter((f: any) => !isExcluded(f.name)));
            } catch (err) {
                console.error(err);
            }
        };

        const handleClick = () => {
            if (file.isFolder) {
                if (!isOpen) loadChildren();
                setIsOpen(!isOpen);
            } else {
                navigate(`/editor/${encodeURIComponent(fullPath)}`);
                setIsSidebarOpen(false);
            }
        };

        return (
            <div>
                <div 
                    onClick={handleClick}
                    className={cn(
                        "flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer rounded hover:bg-accent",
                        isActive ? "bg-primary/10 text-primary" : "text-muted-foreground"
                    )}
                    style={{ paddingLeft: `${level * 12 + 8}px` }}
                >
                    {file.isFolder ? (
                        <>
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            <Folder className="h-4 w-4 text-info" />
                        </>
                    ) : (
                        <>
                            <span className="w-4" />
                            <FileCode className="h-4 w-4 text-info/80" />
                        </>
                    )}
                    <span className="truncate">{file.name}</span>
                </div>
                
                {isOpen && children.map(child => (
                    <FileTreeItem 
                        key={child.name} 
                        file={child} 
                        path={fullPath} 
                        level={level + 1}
                    />
                ))}
            </div>
        );
    };

    return (
        <div 
            ref={containerRef}
            className="flex h-full flex-col overflow-hidden bg-background"
        >
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
                <div className="flex items-center gap-2">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => navigate('/files')}
                        aria-label="Back to files"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="lg:hidden"
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        aria-label="Toggle file tree"
                    >
                        {isSidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                    </Button>
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                        <FileCode className="h-5 w-5 shrink-0 text-info" />
                        {fileId === 'new' ? (
                            <input 
                                value={fileName}
                                onChange={(e) => {
                                    setFileName(e.target.value);
                                    setIsDirty(true);
                                }}
                                className="w-full max-w-[200px] border-b border-primary bg-transparent px-1 text-sm font-medium outline-none"
                                placeholder="filename.py"
                                autoFocus
                            />
                        ) : (
                            <span className="max-w-[150px truncate text-sm font-medium text-foreground sm:max-w-none">{fileName}</span>
                        )}
                        {isDirty && <span className="text-warning">*</span>}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {saveStatus && (
                        <span className={cn(
                            "hidden text-xs sm:inline",
                            saveStatus === 'Saved' ? "text-success" : "text-destructive"
                        )}>
                            {saveStatus}
                        </span>
                    )}
                    <Button 
                        size="sm" 
                        onClick={handleSave}
                        disabled={!isDirty}
                    >
                        <Save className="h-4 w-4" />
                        <span className="hidden sm:inline">Save</span>
                    </Button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar - Responsive */}
                <div className={cn(
                    "absolute inset-y-0 left-0 z-10 flex w-48 shrink-0 flex-col border-r border-border bg-card transition-all duration-200 sm:relative sm:flex sm:w-56 sm:translate-x-0",
                    isSidebarOpen ? "translate-x-0" : "hidden -translate-x-full",
                )}>
                    <div className="border-b border-border p-3">
                        <h3 className="text-sm font-medium text-muted-foreground">Files</h3>
                    </div>
                    <div className="custom-scrollbar flex-1 overflow-y-auto p-2">
                        {sidebarLoading ? (
                            <p className="p-2 text-xs text-muted-foreground">Loading...</p>
                        ) : sidebarFiles.length === 0 ? (
                            <p className="p-2 text-xs text-muted-foreground">No files found</p>
                        ) : (
                            sidebarFiles.map(file => (
                                <FileTreeItem key={file.name} file={file} path="" />
                            ))
                        )}
                    </div>
                </div>

                {/* Overlay for mobile */}
                {isSidebarOpen && (
                    <div 
                        className="fixed inset-0 bg-black/50 z-0 sm:hidden"
                        onClick={() => setIsSidebarOpen(false)}
                    />
                )}

                {/* Editor */}
                <Card className="flex-1 overflow-hidden border-0 rounded-0">
                    <Editor
                        height="100%"
                        defaultLanguage="python"
                        theme="vs-light"
                        value={content}
                        onChange={(value) => {
                            setContent(value || '');
                            setIsDirty(true);
                        }}
                        onMount={handleEditorDidMount}
                        options={{
                            fontSize: 14,
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            padding: { top: 8, bottom: 8 },
                            lineNumbers: 'on',
                            wordWrap: 'on',
                            folding: true,
                            lineDecorationsWidth: 10,
                            lineNumbersMinChars: 3,
                        }}
                    />
                </Card>
            </div>
        </div>
    );
}
