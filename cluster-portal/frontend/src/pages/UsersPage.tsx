import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { userApi } from '@/api/user';
import { 
    Users, 
    UserPlus, 
    Search, 
    RefreshCcw,
    Pencil,
    Trash2,
    Shield
} from "lucide-react";
import { 
    Sheet, 
    SheetContent, 
    SheetDescription, 
    SheetHeader, 
    SheetTitle 
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import PageLoader from "@/components/PageLoader";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface User {
    id: number;
    full_name: string;
    username: string;
    email: string;
    role: 'admin' | 'user' | 'developer';
    is_active: boolean;
    cpu_limit: number;
    memory_limit_gb: number;
    storage_limit_gb: number;
    created_at: string;
}

export default function UsersPage() {
    const { token } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState('');
    
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [userToDelete, setUserToDelete] = useState<User | null>(null);
    
    const [formData, setFormData] = useState({
        full_name: '',
        username: '',
        email: '',
        password: '',
        role: 'user' as 'admin' | 'user' | 'developer',
        is_active: true,
        cpu_limit: 0,
        memory_limit_gb: 4,
        storage_limit_gb: 15
    });

    const fetchUsers = async (quiet = false) => {
        try {
            if (!token) return;
            if (!quiet) setLoading(true);
            else setRefreshing(true);
            
            const res = await userApi.getUsers(token);
            setUsers(res.data);
        } catch (err: any) {
            toast.error(err.response?.data?.detail || "Failed to fetch users.");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, [token]);

    const handleOpenCreate = () => {
        setEditingUser(null);
        setFormData({
            full_name: '',
            username: '',
            email: '',
            password: '',
            role: 'user',
            is_active: true,
            cpu_limit: 0,
            memory_limit_gb: 4,
            storage_limit_gb: 15
        });
        setIsSheetOpen(true);
    };

    const handleOpenEdit = (user: User) => {
        setEditingUser(user);
        setFormData({
            full_name: user.full_name || '',
            username: user.username,
            email: user.email,
            password: '', 
            role: user.role,
            is_active: user.is_active,
            cpu_limit: user.cpu_limit,
            memory_limit_gb: user.memory_limit_gb,
            storage_limit_gb: user.storage_limit_gb
        });
        setIsSheetOpen(true);
    };

    const handleOpenDelete = (user: User) => {
        setUserToDelete(user);
        setIsDeleteOpen(true);
    };

    const confirmDelete = async () => {
        if (!userToDelete || !token) return;
        try {
            await userApi.deleteUser(token, userToDelete.id);
            toast.success("User deleted.");
            fetchUsers(true);
        } catch (err: any) {
            toast.error(err.response?.data?.detail || "Delete failed.");
        } finally {
            setIsDeleteOpen(false);
            setUserToDelete(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token) return;

        try {
            if (editingUser) {
                const submissionData = { ...formData };
                if (!submissionData.password) {
                    delete (submissionData as any).password;
                }
                await userApi.updateUser(token, editingUser.id, submissionData);
                toast.success("User updated.");
            } else {
                await userApi.createUser(token, formData);
                toast.success("User created.");
            }
            setIsSheetOpen(false);
            fetchUsers(true);
        } catch (err: any) {
            toast.error(err.response?.data?.detail || "Operation failed.");
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'number' ? parseInt(value) || 0 : 
                    type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
        }));
    };

    const filteredUsers = users.filter((u: User) => 
        u.username.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        (u.full_name && u.full_name.toLowerCase().includes(search.toLowerCase()))
    );

    if (loading) return <PageLoader message="Loading users..." />;

    return (
        <div className="flex flex-col gap-3 pb-4 selection:bg-primary/30">
            <header className="page-header flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                    <h1 className="page-title text-xl lg:text-2xl font-bold text-gray-900">Users</h1>
                    <p className="page-subtitle text-xs text-muted-foreground mt-1">User management</p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input 
                            placeholder="Search users..." 
                            className="pl-9 h-8 bg-white/5 border-white/5 text-xs rounded-md"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <Button 
                        onClick={() => fetchUsers(true)}
                        size="sm"
                        variant="outline"
                        className={cn("h-8 px-2", refreshing && "animate-spin")}
                    >
                        <RefreshCcw className="h-3.5 w-3.5" />
                    </Button>
                    <Button 
                        onClick={handleOpenCreate}
                        size="sm"
                        className="h-8"
                    >
                        <UserPlus className="h-3.5 w-3.5 mr-1" />
                        Add User
                    </Button>
                </div>
            </header>

            <Card className="overflow-hidden border-white/5 bg-white/[0.02]">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-white/5">
                                <th className="px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">User</th>
                                <th className="px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Role</th>
                                <th className="px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider text-center">CPU Limit</th>
                                <th className="px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider text-center">Memory Limit</th>
                                <th className="px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider text-center">Status</th>
                                <th className="px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-3 py-12 text-center">
                                        <div className="flex flex-col items-center gap-2 opacity-40">
                                            <Users className="h-8 w-8 text-muted-foreground" />
                                            <p className="text-xs text-muted-foreground">No users found</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map((u: User) => (
                                    <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="px-3 py-2.5">
                                            <div className="flex items-center gap-2.5">
                                                <Avatar className="h-8 w-8 rounded-md">
                                                    <AvatarFallback className="bg-white/5 text-xs font-medium">
                                                        {(u.full_name || u.username).substring(0,2).toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <div className="text-sm font-medium text-gray-900">{u.full_name || u.username}</div>
                                                    <div className="text-[10px] text-muted-foreground">{u.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <Badge className={cn(
                                                "text-[10px] font-medium",
                                                u.role === 'admin' ? "bg-amber-500/20 text-amber-500" :
                                                u.role === 'developer' ? "bg-purple-500/20 text-purple-400" :
                                                "bg-primary/20 text-primary"
                                            )}>
                                                {u.role}
                                            </Badge>
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                            <span className="text-sm font-semibold text-gray-900">{u.cpu_limit || '∞'}</span>
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                            <span className="text-sm font-semibold text-gray-900">{u.memory_limit_gb ? `${u.memory_limit_gb}G` : '∞'}</span>
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                            <div className={cn(
                                                "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium",
                                                u.is_active ? "bg-emerald-500/20 text-emerald-500" : "bg-white/5 text-muted-foreground"
                                            )}>
                                                <div className={cn("h-1.5 w-1.5 rounded-full", u.is_active ? "bg-emerald-500" : "bg-muted-foreground")} />
                                                {u.is_active ? 'Active' : 'Inactive'}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button 
                                                    onClick={() => handleOpenEdit(u)}
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7"
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button 
                                                    onClick={() => handleOpenDelete(u)}
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 text-rose-500"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                <SheetContent side="right" className="sm:max-w-md !bg-white !text-black border-l border-gray-100 p-0 overflow-hidden flex flex-col shadow-2xl">
                    <div className="h-2 bg-primary w-full" />
                    <div className="p-8 flex-1 overflow-y-auto space-y-8 pb-32">
                        <SheetHeader>
                            <SheetTitle className="text-3xl font-black tracking-tight text-black flex items-center gap-3">
                                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                                    <Users className="h-6 w-6 text-primary" />
                                </div>
                                {editingUser ? "Edit User" : "Add User"}
                            </SheetTitle>
                            <SheetDescription className="text-gray-500 font-medium text-xs mt-1">
                                {editingUser ? `Change settings for ${editingUser?.username}` : "Create a new user account."}
                            </SheetDescription>
                        </SheetHeader>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid grid-cols-1 gap-5">
                                <div className="group">
                                    <Label htmlFor="full_name" className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Full Name</Label>
                                    <Input 
                                        id="full_name"
                                        name="full_name"
                                        placeholder="Full Name"
                                        className="h-12 bg-gray-50 border-gray-100 rounded-xl focus:bg-white transition-all text-sm font-semibold"
                                        value={formData.full_name}
                                        onChange={handleInputChange}
                                    />
                                </div>
                                <div className="group">
                                    <Label htmlFor="username" className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Username</Label>
                                    <Input 
                                        id="username"
                                        name="username"
                                        placeholder="username"
                                        disabled={!!editingUser}
                                        className="h-12 bg-gray-50 border-gray-100 rounded-xl focus:bg-white transition-all text-sm font-mono"
                                        value={formData.username}
                                        onChange={handleInputChange}
                                        required
                                    />
                                </div>
                            </div>
                            
                            <div className="group">
                                <Label htmlFor="email" className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Email Address</Label>
                                <Input 
                                    id="email"
                                    name="email"
                                    type="email"
                                    placeholder="email@example.com"
                                    className="h-12 bg-gray-50 border-gray-100 rounded-xl focus:bg-white transition-all text-sm font-semibold"
                                    value={formData.email}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>
                            
                            <div className="group">
                                <Label htmlFor="password" className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">
                                    {editingUser ? "Password (leave blank to keep current)" : "Password"}
                                </Label>
                                <Input 
                                    id="password"
                                    name="password"
                                    type="password"
                                    placeholder="••••••••"
                                    className="h-12 bg-gray-50 border-gray-100 rounded-xl focus:bg-white transition-all text-sm font-mono"
                                    value={formData.password}
                                    onChange={handleInputChange}
                                    required={!editingUser}
                                />
                            </div>

                            <div>
                                <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">Resource Limits</Label>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100 text-center">
                                        <Label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Cores</Label>
                                        <Input 
                                            name="cpu_limit"
                                            type="number"
                                            className="h-8 bg-transparent border-none text-center text-lg font-black p-0 focus-visible:ring-0"
                                            value={formData.cpu_limit}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100 text-center">
                                        <Label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">RAM (GB)</Label>
                                        <Input 
                                            name="memory_limit_gb"
                                            type="number"
                                            className="h-8 bg-transparent border-none text-center text-lg font-black p-0 focus-visible:ring-0"
                                            value={formData.memory_limit_gb}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100 text-center">
                                        <Label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">DISK (GB)</Label>
                                        <Input 
                                            name="storage_limit_gb"
                                            type="number"
                                            className="h-8 bg-transparent border-none text-center text-lg font-black p-0 focus-visible:ring-0"
                                            value={formData.storage_limit_gb}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">User Role</Label>
                                <div className="flex gap-2">
                                    {(['user', 'admin', 'developer'] as const).map(role => (
                                        <button 
                                            key={role}
                                            type="button"
                                            onClick={() => setFormData({...formData, role})}
                                            className={cn(
                                                "flex-1 py-3 px-2 rounded-xl text-[10px] font-black uppercase transition-all tracking-wider border",
                                                formData.role === role 
                                                    ? "bg-black text-white border-black shadow-lg" 
                                                    : "bg-white text-gray-400 border-gray-100 hover:border-gray-300"
                                            )}
                                        >
                                            {role}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                <div>
                                    <span className="text-[11px] font-bold text-gray-900 uppercase tracking-tight">Account Status</span>
                                    <p className="text-[9px] text-gray-400">Toggle account on or off</p>
                                </div>
                                <button 
                                    type="button"
                                    onClick={() => setFormData({...formData, is_active: !formData.is_active})}
                                    className={cn(
                                        "w-12 h-6 rounded-full transition-all relative shadow-inner",
                                        formData.is_active ? "bg-emerald-500" : "bg-gray-200"
                                    )}
                                >
                                    <div className={cn(
                                        "absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-md",
                                        formData.is_active ? "translate-x-7" : "translate-x-1"
                                    )} />
                                </button>
                            </div>
                        </form>
                    </div>
                    <div className="p-6 bg-white border-t border-gray-100">
                        <Button 
                            onClick={(e) => handleSubmit(e as any)}
                            className="w-full h-14 rounded-2xl bg-black hover:bg-gray-800 text-white text-lg font-black shadow-xl transition-all active:scale-95"
                        >
                            {editingUser ? "Save Changes" : "Create User"}
                        </Button>
                    </div>
                </SheetContent>
            </Sheet>

            <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <AlertDialogContent className="!bg-white !text-black border-none shadow-2xl rounded-[2.5rem] p-8 max-w-sm">
                    <AlertDialogHeader className="items-center text-center">
                        <div className="h-16 w-16 bg-rose-50 rounded-2xl flex items-center justify-center mb-4">
                            <Trash2 className="h-8 w-8 text-rose-500" />
                        </div>
                        <AlertDialogTitle className="text-xl font-black text-gray-900">Purge User Identity?</AlertDialogTitle>
                        <AlertDialogDescription className="text-gray-500 text-xs mt-2 px-2">
                            This will permanently revoke all cluster access for <span className="text-rose-600 font-black">@{userToDelete?.username}</span> and prune their associated job registry.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex flex-col sm:flex-col gap-2 mt-6">
                        <AlertDialogCancel className="rounded-xl font-bold h-10 border-gray-100">Abort Deletion</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={confirmDelete}
                            className="rounded-xl h-12 shadow-lg shadow-rose-200 font-bold bg-rose-500 hover:bg-rose-600 border-none"
                        >
                            Confirm Purge
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
