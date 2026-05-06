import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Clock,
  Laptop,
  Monitor,
  Network,
  RefreshCcw,
  Server,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';

import { devNodesApi, type DevNode } from '@/api/devNodes';
import { useAuth } from '@/context/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type NodeFamily = 'ubuntu' | 'windows';

type ManagedNode = DevNode & {
  family: NodeFamily;
  accessLabel: string;
  detectionReason: string;
  isLiveDetected: boolean;
};

const WINDOWS_PORTS = new Set([3389, 5985, 5986]);

function classifyNode(node: DevNode): ManagedNode {
  const runtimeFamily = node.effective_os_family?.toLowerCase();
  if (runtimeFamily === 'ubuntu' || runtimeFamily === 'windows') {
    const isWindows = runtimeFamily === 'windows';
    const accessPort = node.detected_access_port || node.ssh_port;
    return {
      ...node,
      family: runtimeFamily,
      accessLabel: node.detected_access_label || (isWindows
        ? accessPort === 3389 ? 'RDP' : accessPort === 5985 || accessPort === 5986 ? 'WinRM' : 'SSH'
        : 'SSH'),
      ssh_port: accessPort,
      detectionReason: node.detection_source || (node.detected_os_family ? 'live detected' : 'saved admin setting'),
      isLiveDetected: Boolean(node.detected_os_family && node.detected_reachable),
    };
  }

  const explicitFamily = node.os_family?.toLowerCase();
  if (explicitFamily === 'ubuntu' || explicitFamily === 'windows') {
    const port = Number(node.ssh_port);
    const isWindows = explicitFamily === 'windows';
    return {
      ...node,
      family: explicitFamily,
      accessLabel: isWindows
        ? port === 3389 ? 'RDP' : port === 5985 || port === 5986 ? 'WinRM' : 'SSH'
        : 'SSH',
      detectionReason: 'saved admin setting',
      isLiveDetected: false,
    };
  }

  const nodeName = node.name.toLowerCase();
  const username = node.ssh_username.toLowerCase();
  const port = Number(node.ssh_port);

  const hasWindowsName =
    nodeName.includes('windows') ||
    nodeName.startsWith('win') ||
    nodeName.includes('-win') ||
    nodeName.includes('_win');
  const hasWindowsUser =
    username.includes('administrator') ||
    username.includes('adminuser') ||
    username.includes('domain\\');
  const hasWindowsPort = WINDOWS_PORTS.has(port);

  if (hasWindowsName || hasWindowsUser || hasWindowsPort) {
    return {
      ...node,
      family: 'windows',
      accessLabel: port === 3389 ? 'RDP' : port === 5985 || port === 5986 ? 'WinRM' : 'SSH',
      detectionReason: hasWindowsPort
        ? `detected from port ${port}`
        : hasWindowsUser
          ? 'detected from login user'
          : 'detected from node name',
      isLiveDetected: false,
    };
  }

  return {
    ...node,
    family: 'ubuntu',
    accessLabel: 'SSH',
    detectionReason: nodeName.includes('ubuntu') ? 'detected from node name' : 'linux ssh profile',
    isLiveDetected: false,
  };
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Registered';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function EmptyColumn({ family }: { family: NodeFamily }) {
  const label = family === 'ubuntu' ? 'Ubuntu nodes' : 'Windows nodes';
  return (
      <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/70 px-6 py-10 text-center">
      <Network className="mb-3 h-8 w-8 text-gray-300" />
      <p className="text-sm font-bold text-gray-900">No {label.toLowerCase()} registered</p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-gray-500">
        Add nodes in Slurm Nodes. Refresh runs live SSH, RDP, WinRM, SMB, and RPC probes.
      </p>
    </div>
  );
}

function NodeTile({ node }: { node: ManagedNode }) {
  const isWindows = node.family === 'windows';
  const Icon = isWindows ? Monitor : Server;

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:border-gray-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border',
              isWindows
                ? 'border-sky-100 bg-sky-50 text-sky-700'
                : 'border-emerald-100 bg-emerald-50 text-emerald-700'
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-black uppercase tracking-tight text-gray-950">
              {node.name}
            </h3>
            <p className="mt-1 truncate font-mono text-xs font-semibold text-gray-500">
              {node.ip_address || 'No IP registered'}
            </p>
          </div>
        </div>
        <Badge
          variant="secondary"
          className={cn(
            'shrink-0 border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em]',
            isWindows
              ? 'border-sky-100 bg-sky-50 text-sky-700'
              : 'border-emerald-100 bg-emerald-50 text-emerald-700'
          )}
        >
          {node.isLiveDetected ? 'live ' : ''}{node.family}
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">
            <ShieldCheck className="h-3 w-3" />
            Access
          </div>
          <p className="mt-1 truncate text-sm font-bold text-gray-900">
            {node.accessLabel}:{node.ssh_port}
          </p>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">
            <UserRound className="h-3 w-3" />
            Login
          </div>
          <p className="mt-1 truncate text-sm font-bold text-gray-900">{node.ssh_username}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between">
        <span className="inline-flex items-center gap-1.5">
          <Laptop className="h-3.5 w-3.5" />
          {node.detectionReason}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 font-bold",
            node.detected_reachable ? "text-emerald-600" : "text-amber-600"
          )}
        >
          <span className={cn("h-2 w-2 rounded-full", node.detected_reachable ? "bg-emerald-500" : "bg-amber-400")} />
          {node.detected_reachable ? "reachable" : "fallback"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {formatDate(node.created_at)}
        </span>
      </div>
    </div>
  );
}

function NodeColumn({
  title,
  description,
  family,
  nodes,
}: {
  title: string;
  description: string;
  family: NodeFamily;
  nodes: ManagedNode[];
}) {
  const isWindows = family === 'windows';

  return (
    <Card className="overflow-hidden border-gray-100 bg-white">
      <div
        className={cn(
          'border-b px-5 py-4',
          isWindows ? 'border-sky-100 bg-sky-50/60' : 'border-emerald-100 bg-emerald-50/60'
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-black text-gray-950">{title}</h2>
            <p className="mt-1 text-xs text-gray-500">{description}</p>
          </div>
          <Badge
            variant="secondary"
            className={cn(
              'border text-xs font-black',
              isWindows
                ? 'border-sky-100 bg-white text-sky-700'
                : 'border-emerald-100 bg-white text-emerald-700'
            )}
          >
            {nodes.length}
          </Badge>
        </div>
      </div>

        <div className="max-h-[calc(100vh-260px)] grid grid-cols-2 gap-3 overflow-y-auto p-4">
        {nodes.length > 0 ? nodes.map((node) => <NodeTile key={node.id} node={node} />) : <div className="col-span-2"><EmptyColumn family={family} /></div>}
      </div>
    </Card>
  );
}

export default function NodeManagementPage() {
  const { token } = useAuth();
  const [nodes, setNodes] = useState<DevNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadNodes = useCallback(async (showToast = false) => {
    if (!token) return;
    try {
      setRefreshing(true);
      const response = await devNodesApi.getNodes(token);
      setNodes(response.data || []);
      if (showToast) toast.success('Node inventory refreshed');
    } catch (error) {
      console.error('Failed to load node management inventory', error);
      toast.error('Unable to load registered nodes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    loadNodes();
  }, [loadNodes]);

  const grouped = useMemo(() => {
    const managed = nodes.map(classifyNode);
    return {
      ubuntu: managed.filter((node) => node.family === 'ubuntu'),
      windows: managed.filter((node) => node.family === 'windows'),
    };
  }, [nodes]);

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-gray-950">Node Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Registered access inventory grouped for HPC administration.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => loadNodes(true)}
          disabled={refreshing}
          className="h-10 gap-2 border-gray-200 bg-white font-bold"
        >
          <RefreshCcw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Skeleton className="h-[420px] rounded-xl" />
          <Skeleton className="h-[420px] rounded-xl" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <NodeColumn
            title="Ubuntu Nodes"
            description="Live SSH targets or saved Linux inventory."
            family="ubuntu"
            nodes={grouped.ubuntu}
          />
          <NodeColumn
            title="Windows Nodes"
            description="Live RDP, WinRM, SMB, RPC targets or saved Windows inventory."
            family="windows"
            nodes={grouped.windows}
          />
        </div>
      )}
    </div>
  );
}
