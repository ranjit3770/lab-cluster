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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import PageLoader from "@/components/PageLoader";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
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
        <div className="flex flex-col pb-4">
            <PageHeader
                title="Users"
                description="User management"
                actions={
                    <>
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                            <Input
                                placeholder="Search users..."
                                className="h-8 pl-9 text-xs"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                aria-label="Search users"
                            />
                        </div>
                        <Button
                            onClick={() => fetchUsers(true)}
                            size="sm"
                            variant="outline"
                            className="h-8 px-2"
                            aria-label="Refresh users"
                        >
                            <RefreshCcw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
                        </Button>
                        <Button onClick={handleOpenCreate} size="sm" className="h-8">
                            <UserPlus className="h-3.5 w-3.5" />
                            Add User
                        </Button>
                    </>
                }
            />

            {filteredUsers.length === 0 ? (
                <EmptyState
                    icon={Users}
                    title="No users found"
                    description="No user accounts match your search."
                />
            ) : (
                <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-border bg-muted/50">
                                    <th className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">User</th>
                                    <th className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Role</th>
                                    <th className="px-3 py-2.5 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">CPU Limit</th>
                                    <th className="px-3 py-2.5 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Memory Limit</th>
                                    <th className="px-3 py-2.5 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</th>
                                    <th className="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {filteredUsers.map((u: User) => (
                                    <tr key={u.id} className="transition-colors hover:bg-accent/40">
                                        <td className="px-3 py-2.5">
                                            <div className="flex items-center gap-2.5">
                                                <Avatar className="h-7 w-7 rounded-md">
                                                    <AvatarFallback className="rounded-md bg-primary/10 text-xs font-medium text-primary">
                                                        {(u.full_name || u.username).substring(0,2).toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="min-w-0">
                                                    <div className="truncate text-sm font-medium text-foreground">{u.full_name || u.username}</div>
                                                    <div className="truncate text-[11px] text-muted-foreground">{u.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <Badge
                                                variant="outline"
                                                size="sm"
                                                className={cn(
                                                    "font-medium capitalize",
                                                    u.role === 'admin' && "border-warning/25 bg-warning/10 text-warning",
                                                    u.role === 'developer' && "border-info/20 bg-info/10 text-info",
                                                    u.role === 'user' && "border-primary/20 bg-primary/10 text-primary"
                                                )}
                                            >
                                                {u.role}
                                            </Badge>
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                            <span className="text-sm font-semibold tabular-nums text-foreground">{u.cpu_limit || '∞'}</span>
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                            <span className="text-sm font-semibold tabular-nums text-foreground">{u.memory_limit_gb ? `${u.memory_limit_gb}G` : '∞'}</span>
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                            <div className={cn(
                                                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                                                u.is_active
                                                    ? "border-success/20 bg-success/10 text-success"
                                                    : "border-border bg-muted text-muted-foreground"
                                            )}>
                                                <div className={cn(
                                                    "h-1.5 w-1.5 rounded-full",
                                                    u.is_active ? "bg-success" : "bg-muted-foreground/60"
                                                )} />
                                                {u.is_active ? 'Active' : 'Inactive'}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button
                                                    onClick={() => handleOpenEdit(u)}
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 px-1.5"
                                                    aria-label={`Edit ${u.username}`}
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    onClick={() => handleOpenDelete(u)}
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 px-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                    aria-label={`Delete ${u.username}`}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                <SheetContent side="right" className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
                    <div className="flex-1 space-y-6 overflow-y-auto p-6 pb-4 custom-scrollbar">
                        <SheetHeader className="space-y-1 p-0">
                            <SheetTitle className="flex items-center gap-2.5 text-lg font-semibold text-foreground">
                                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                                    <Users className="h-4 w-4 text-primary" aria-hidden />
                                </span>
                                {editingUser ? "Edit User" : "Add User"}
                            </SheetTitle>
                            <SheetDescription className="text-xs text-muted-foreground">
                                {editingUser ? `Change settings for ${editingUser?.username}` : "Create a new user account."}
                            </SheetDescription>
                        </SheetHeader>

                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <Label htmlFor="full_name" className="text-xs font-medium text-foreground">Full Name</Label>
                                    <Input
                                        id="full_name"
                                        name="full_name"
                                        placeholder="Full Name"
                                        className="mt-1.5 h-9 text-sm"
                                        value={formData.full_name}
                                        onChange={handleInputChange}
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="username" className="text-xs font-medium text-foreground">Username</Label>
                                    <Input
                                        id="username"
                                        name="username"
                                        placeholder="username"
                                        disabled={!!editingUser}
                                        className="mt-1.5 h-9 font-mono text-sm"
                                        value={formData.username}
                                        onChange={handleInputChange}
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <Label htmlFor="email" className="text-xs font-medium text-foreground">Email Address</Label>
                                <Input
                                    id="email"
                                    name="email"
                                    type="email"
                                    placeholder="email@example.com"
                                    className="mt-1.5 h-9 text-sm"
                                    value={formData.email}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>

                            <div>
                                <Label htmlFor="password" className="text-xs font-medium text-foreground">
                                    {editingUser ? "Password (leave blank to keep current)" : "Password"}
                                </Label>
                                <Input
                                    id="password"
                                    name="password"
                                    type="password"
                                    placeholder="••••••••"
                                    className="mt-1.5 h-9 font-mono text-sm"
                                    value={formData.password}
                                    onChange={handleInputChange}
                                    required={!editingUser}
                                />
                            </div>

                            <div>
                                <Label className="text-xs font-medium text-foreground">Resource Limits</Label>
                                <div className="mt-1.5 grid grid-cols-3 gap-2">
                                    <div className="rounded-md border border-border bg-muted/50 p-2 text-center">
                                        <Label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Cores</Label>
                                        <Input
                                            name="cpu_limit"
                                            type="number"
                                            className="mt-1 h-8 border-none bg-transparent p-0 text-center text-sm font-semibold shadow-none focus-visible:ring-0"
                                            value={formData.cpu_limit}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                    <div className="rounded-md border border-border bg-muted/50 p-2 text-center">
                                        <Label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">RAM (GB)</Label>
                                        <Input
                                            name="memory_limit_gb"
                                            type="number"
                                            className="mt-1 h-8 border-none bg-transparent p-0 text-center text-sm font-semibold shadow-none focus-visible:ring-0"
                                            value={formData.memory_limit_gb}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                    <div className="rounded-md border border-border bg-muted/50 p-2 text-center">
                                        <Label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">DISK (GB)</Label>
                                        <Input
                                            name="storage_limit_gb"
                                            type="number"
                                            className="mt-1 h-8 border-none bg-transparent p-0 text-center text-sm font-semibold shadow-none focus-visible:ring-0"
                                            value={formData.storage_limit_gb}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <Label className="text-xs font-medium text-foreground">User Role</Label>
                                <div className="mt-1.5 flex gap-2">
                                    {(['user', 'admin', 'developer'] as const).map(role => (
                                        <button
                                            key={role}
                                            type="button"
                                            onClick={() => setFormData({...formData, role})}
                                            className={cn(
                                                "flex-1 rounded-md border px-2 py-2 text-[11px] font-medium uppercase tracking-wide transition-colors",
                                                formData.role === role
                                                    ? "border-primary bg-primary text-primary-foreground shadow-xs"
                                                    : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                                            )}
                                        >
                                            {role}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center justify-between rounded-md border border-border bg-muted/50 p-3">
                                <div>
                                    <span className="text-xs font-medium text-foreground">Account Status</span>
                                    <p className="text-[11px] text-muted-foreground">Toggle account on or off</p>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={formData.is_active}
                                    aria-label="Account status"
                                    onClick={() => setFormData({...formData, is_active: !formData.is_active})}
                                    className={cn(
                                        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                                        formData.is_active ? "bg-success" : "bg-input"
                                    )}
                                >
                                    <div className={cn(
                                        "absolute top-0.5 h-4 w-4 rounded-full bg-background shadow-sm transition-all",
                                        formData.is_active ? "translate-x-[18px]" : "translate-x-0.5"
                                    )} />
                                </button>
                            </div>
                        </form>
                    </div>
                    <div className="border-t border-border bg-card p-4">
                        <Button
                            onClick={(e) => handleSubmit(e as any)}
                            className="w-full h-9"
                        >
                            {editingUser ? "Save Changes" : "Create User"}
                        </Button>
                    </div>
                </SheetContent>
            </Sheet>

            <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <AlertDialogContent className="max-w-sm">
                    <AlertDialogHeader className="items-center text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-destructive/10">
                            <Trash2 className="h-6 w-6 text-destructive" aria-hidden />
                        </div>
                        <AlertDialogTitle className="text-base font-semibold text-foreground">Purge User Identity?</AlertDialogTitle>
                        <AlertDialogDescription className="text-xs leading-5 text-muted-foreground">
                            This will permanently revoke all cluster access for <span className="font-medium text-destructive">@{userToDelete?.username}</span> and prune their associated job registry.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
                        <AlertDialogCancel>Abort Deletion</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Confirm Purge
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
