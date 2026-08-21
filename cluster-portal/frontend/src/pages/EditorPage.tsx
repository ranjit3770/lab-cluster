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
                        "flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer rounded hover:bg-gray-100",
                        isActive ? "bg-primary/10 text-primary" : "text-gray-600"
                    )}
                    style={{ paddingLeft: `${level * 12 + 8}px` }}
                >
                    {file.isFolder ? (
                        <>
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            <Folder className="h-4 w-4 text-blue-500" />
                        </>
                    ) : (
                        <>
                            <span className="w-4" />
                            <FileCode className="h-4 w-4 text-blue-400" />
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
            className="flex flex-col h-[calc(100vh-4rem)] sm:h-[calc(100vh-3.5rem)] lg:h-screen -m-4 p-0"
        >
            <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-200 bg-white shrink-0">
                <div className="flex items-center gap-2">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => navigate('/files')}
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="lg:hidden"
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    >
                        {isSidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                    </Button>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <FileCode className="h-5 w-5 text-blue-500 shrink-0" />
                        {fileId === 'new' ? (
                            <input 
                                value={fileName}
                                onChange={(e) => {
                                    setFileName(e.target.value);
                                    setIsDirty(true);
                                }}
                                className="bg-gray-100 border-b border-primary px-1 focus:outline-none text-sm font-medium w-full max-w-[200px]"
                                placeholder="filename.py"
                                autoFocus
                            />
                        ) : (
                            <span className="font-medium text-gray-900 text-sm truncate max-w-[150px] sm:max-w-none">{fileName}</span>
                        )}
                        {isDirty && <span className="text-amber-500">*</span>}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {saveStatus && (
                        <span className={cn(
                            "text-xs hidden sm:inline",
                            saveStatus === 'Saved' ? "text-green-600" : "text-red-500"
                        )}>
                            {saveStatus}
                        </span>
                    )}
                    <Button 
                        size="sm" 
                        onClick={handleSave}
                        disabled={!isDirty}
                    >
                        <Save className="h-4 w-4 mr-1" />
                        <span className="hidden sm:inline">Save</span>
                    </Button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar - Responsive */}
                <div className={cn(
                    "w-48 sm:w-56 shrink-0 bg-white border-r border-gray-200 flex flex-col transition-all duration-200",
                    isSidebarOpen ? "translate-x-0" : "-translate-x-full hidden",
                    "absolute sm:relative inset-y-0 left-0 z-10 sm:translate-x-0 sm:flex"
                )}>
                    <div className="p-3 border-b border-gray-100">
                        <h3 className="font-medium text-sm text-gray-700">Files</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2">
                        {sidebarLoading ? (
                            <p className="text-xs text-gray-400 p-2">Loading...</p>
                        ) : sidebarFiles.length === 0 ? (
                            <p className="text-xs text-gray-400 p-2">No files found</p>
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
