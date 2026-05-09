import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Clock,
  Laptop,
  Monitor,
  Network,
  RefreshCcw,
  Server,
  Timer,
  Play,
  ArrowRight,
  Loader2,
  Search,
  CheckSquare,
  Square,
} from 'lucide-react';
import { toast } from 'sonner';

import { devNodesApi, type DevNode } from '@/api/devNodes';
import { windowsNodesApi } from '@/api/windowsNodes';
import { useAuth } from '@/context/AuthContext';
import PageLoader from '@/components/PageLoader';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type NodeFamily = 'ubuntu' | 'windows';

type ManagedNode = DevNode & {
  family: NodeFamily;
  detectionReason: string;
};

const WINDOWS_PORTS = new Set([3389, 5985, 5986]);

function classifyNode(node: DevNode): ManagedNode {
  if (node.auto_discovered) {
    const autoFamily = node.effective_os_family?.toLowerCase() === 'windows' ? 'windows' : 'ubuntu';
    return {
      ...node,
      family: autoFamily,
      detectionReason: 'auto-discovered from Slurm',
    };
  }

  const runtimeFamily = node.effective_os_family?.toLowerCase();
  if (runtimeFamily === 'ubuntu' || runtimeFamily === 'windows') {
    return {
      ...node,
      family: runtimeFamily,
      detectionReason: node.detection_source || (node.detected_os_family ? 'live detected' : 'saved admin setting'),
    };
  }

  const explicitFamily = node.os_family?.toLowerCase();
  if (explicitFamily === 'ubuntu' || explicitFamily === 'windows') {
    return {
      ...node,
      family: explicitFamily,
      detectionReason: 'saved admin setting',
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
      detectionReason: hasWindowsPort
        ? `detected from port ${port}`
        : hasWindowsUser
          ? 'detected from login user'
          : 'detected from node name',
    };
  }

  return {
    ...node,
    family: 'ubuntu',
    detectionReason: nodeName.includes('ubuntu') ? 'detected from node name' : 'linux ssh profile',
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
        Add nodes in Slurm configuration to see them here.
      </p>
    </div>
  );
}

const slurmdStatusConfig: Record<string, { label: string; dotClass: string; bgClass: string }> = {
  active: {
    label: 'Active',
    dotClass: 'bg-emerald-500',
    bgClass: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  },
  inactive: {
    label: 'Inactive',
    dotClass: 'bg-red-500',
    bgClass: 'bg-red-50 text-red-700 border-red-100',
  },
  failed: {
    label: 'Failed',
    dotClass: 'bg-red-500',
    bgClass: 'bg-red-50 text-red-700 border-red-100',
  },
  'not-found': {
    label: 'Not Found',
    dotClass: 'bg-amber-400',
    bgClass: 'bg-amber-50 text-amber-700 border-amber-100',
  },
  not_found: {
    label: 'Not Found',
    dotClass: 'bg-amber-400',
    bgClass: 'bg-amber-50 text-amber-700 border-amber-100',
  },
  activating: {
    label: 'Activating',
    dotClass: 'bg-blue-400',
    bgClass: 'bg-blue-50 text-blue-700 border-blue-100',
  },
  unknown: {
    label: 'Unknown',
    dotClass: 'bg-gray-300',
    bgClass: 'bg-gray-50 text-gray-500 border-gray-100',
  },
};

function SlurmdBadge({ status }: { status?: string | null }) {
  const config = slurmdStatusConfig[status || 'unknown'] || slurmdStatusConfig.unknown;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold', config.bgClass)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', config.dotClass)} />
      {config.label}
    </span>
  );
}

function UptimeValue({ uptime, uptimeSeconds }: { uptime?: string | null; uptimeSeconds?: number | null }) {
  if (!uptime || uptime === 'N/A') {
    return <span className="text-sm font-bold text-gray-400">N/A</span>;
  }
  return (
    <span className="text-sm font-bold text-gray-900" title={uptimeSeconds ? `${uptimeSeconds}s` : undefined}>
      {uptime}
    </span>
  );
}

function NodeTile({ node, selected, onSelect, onSetupIdle, onSwitchToCluster }: {
  node: ManagedNode;
  selected: boolean;
  onSelect: (id: number) => void;
  onSetupIdle: (node: ManagedNode) => void;
  onSwitchToCluster: (node: ManagedNode) => void;
}) {
  const isWindows = node.family === 'windows';
  const isAuto = node.auto_discovered;
  const Icon = isWindows ? Monitor : Server;

  const [setupIdleLoading, setSetupIdleLoading] = useState(false);
  const [switchOsLoading, setSwitchOsLoading] = useState(false);

  const handleSetupIdle = () => {
    setSetupIdleLoading(true);
    onSetupIdle(node);
    setSetupIdleLoading(false);
  };

  const handleSwitchToCluster = () => {
    setSwitchOsLoading(true);
    onSwitchToCluster(node);
    setSwitchOsLoading(false);
  };

  return (
    <div className={cn(
      'rounded-xl border p-4 shadow-sm transition-all',
      selected ? 'border-sky-400 ring-2 ring-sky-200 bg-sky-50/30' : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-md'
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2 flex-1">
          {isWindows && (
            <button onClick={() => onSelect(node.id)} className="mt-2 shrink-0 cursor-pointer">
              {selected ? (
                <CheckSquare className="h-5 w-5 text-sky-600" />
              ) : (
                <Square className="h-5 w-5 text-gray-300 hover:text-gray-400" />
              )}
            </button>
          )}
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
              isWindows
                ? 'border-sky-100 bg-sky-50 text-sky-700'
                : 'border-emerald-100 bg-emerald-50 text-emerald-700'
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-black uppercase tracking-tight text-gray-950">
              {node.name}
            </h3>
            <p className="mt-0.5 truncate font-mono text-xs font-semibold text-gray-500">
              {node.ip_address || 'No IP registered'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isAuto && (
            <Badge
              variant="secondary"
              className="border-violet-100 bg-violet-50 text-[10px] font-black uppercase tracking-[0.12em] text-violet-700"
            >
              Slurm
            </Badge>
          )}
          <Badge
            variant="secondary"
            className={cn(
              'shrink-0 border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em]',
              isWindows
                ? 'border-sky-100 bg-sky-50 text-sky-700'
                : 'border-emerald-100 bg-emerald-50 text-emerald-700'
            )}
          >
            {node.family}
          </Badge>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {isWindows ? (
          <>
            <div className="col-span-2 flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleSetupIdle}
                disabled={setupIdleLoading}
                size="sm"
                className="flex-1 gap-1.5 border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-800 font-black text-[10px] uppercase tracking-wider h-9 px-2"
              >
                {setupIdleLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                Setup Idle
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleSwitchToCluster}
                disabled={switchOsLoading}
                size="sm"
                className="flex-1 gap-1.5 border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800 font-black text-[10px] uppercase tracking-wider h-9 px-2"
              >
                {switchOsLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowRight className="h-3.5 w-3.5" />
                )}
                Switch to Cluster
              </Button>
            </div>
            <div className="col-span-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">
                <Timer className="h-3 w-3" />
                Uptime
              </div>
              <div className="mt-1">
                {isAuto ? (
                  <span className="text-xs font-bold text-gray-400">No SSH</span>
                ) : (
                  <UptimeValue uptime={node.uptime} uptimeSeconds={node.uptime_seconds} />
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">
                <Activity className="h-3 w-3" />
                Slurmd Service
              </div>
              <div className="mt-1">
                <SlurmdBadge status={node.slurmd_status} />
              </div>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">
                <Timer className="h-3 w-3" />
                Uptime
              </div>
              <div className="mt-1">
                {isAuto ? (
                  <span className="text-xs font-bold text-gray-400">No SSH</span>
                ) : (
                  <UptimeValue uptime={node.uptime} uptimeSeconds={node.uptime_seconds} />
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-100 pt-3 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <Laptop className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{node.detectionReason}</span>
        </span>
        {!isAuto && (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 font-bold shrink-0',
              node.detected_reachable ? 'text-emerald-600' : 'text-amber-600'
            )}
          >
            <span className={cn('h-2 w-2 rounded-full', node.detected_reachable ? 'bg-emerald-500' : 'bg-amber-400')} />
            {node.detected_reachable ? 'reachable' : 'fallback'}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 shrink-0">
          <Clock className="h-3.5 w-3.5" />
          {formatDate(node.created_at)}
        </span>
      </div>
    </div>
  );
}

const PAGE_SIZE = 20;

function NodeColumn({
  title,
  description,
  family,
  nodes,
  search,
  onSearchChange,
  selectedIds,
  onSelect,
  onSetupIdle,
  onSwitchToCluster,
  bulkSetupIdle,
  bulkSwitchToCluster,
  bulkLoading,
}: {
  title: string;
  description: string;
  family: NodeFamily;
  nodes: ManagedNode[];
  search: string;
  onSearchChange: (v: string) => void;
  selectedIds: Set<number>;
  onSelect: (id: number) => void;
  onSetupIdle: (node: ManagedNode) => void;
  onSwitchToCluster: (node: ManagedNode) => void;
  bulkSetupIdle?: () => void;
  bulkSwitchToCluster?: () => void;
  bulkLoading?: boolean;
}) {
  const isWindows = family === 'windows';
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!search.trim()) return nodes;
    const q = search.toLowerCase();
    return nodes.filter(n =>
      n.name.toLowerCase().includes(q) ||
      n.ip_address.toLowerCase().includes(q)
    );
  }, [nodes, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const pageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  useEffect(() => {
    setPage(1);
  }, [search, nodes]);

  const hasSelection = selectedIds.size > 0;

  return (
    <Card className="overflow-hidden border-gray-100 bg-white flex flex-col">
      <div
        className={cn(
          'border-b px-4 py-3',
          isWindows ? 'border-sky-100 bg-sky-50/60' : 'border-emerald-100 bg-emerald-50/60'
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-black text-gray-950">{title}</h2>
            <p className="mt-0.5 text-xs text-gray-500">{description}</p>
          </div>
          <Badge
            variant="secondary"
            className={cn(
              'border text-xs font-black shrink-0',
              isWindows
                ? 'border-sky-100 bg-white text-sky-700'
                : 'border-emerald-100 bg-white text-emerald-700'
            )}
          >
            {filtered.length}
          </Badge>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            placeholder={`Search ${family} nodes...`}
            className="pl-8 h-8 text-xs rounded-md bg-white/80"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        {isWindows && hasSelection && (
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={bulkSetupIdle}
              disabled={bulkLoading}
              className="flex-1 h-8 gap-1 border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 font-black text-[10px] uppercase tracking-wider"
            >
              {bulkLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              Bulk Setup Idle ({selectedIds.size})
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={bulkSwitchToCluster}
              disabled={bulkLoading}
              className="flex-1 h-8 gap-1 border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 font-black text-[10px] uppercase tracking-wider"
            >
              {bulkLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ArrowRight className="h-3 w-3" />
              )}
              Switch to Cluster ({selectedIds.size})
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 grid grid-cols-1 gap-3 overflow-y-auto p-4 content-start md:grid-cols-2">
        {filtered.length > 0 ? pageItems.map((node) => (
          <NodeTile
            key={node.id}
            node={node}
            selected={selectedIds.has(node.id)}
            onSelect={onSelect}
            onSetupIdle={onSetupIdle}
            onSwitchToCluster={onSwitchToCluster}
          />
        )) : (
          <div className="col-span-1 md:col-span-2">
            {nodes.length === 0 ? (
              <EmptyColumn family={family} />
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[120px] rounded-xl border border-dashed border-gray-200 bg-gray-50/70 px-4 py-8 text-center">
                <Search className="mb-2 h-6 w-6 text-gray-300" />
                <p className="text-sm font-bold text-gray-500">No matching nodes</p>
              </div>
            )}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2">
          <span className="text-xs font-semibold text-gray-500">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-7 w-7 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-7 w-7 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function NodeManagementPage() {
  const { token } = useAuth();
  const [nodes, setNodes] = useState<DevNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [searchUbuntu, setSearchUbuntu] = useState('');
  const [searchWindows, setSearchWindows] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [setupIdleDialogOpen, setSetupIdleDialogOpen] = useState(false);
  const [setupIdleDialogNode, setSetupIdleDialogNode] = useState<ManagedNode | null>(null);

  const [switchClusterDialogOpen, setSwitchClusterDialogOpen] = useState(false);
  const [switchClusterDialogNode, setSwitchClusterDialogNode] = useState<ManagedNode | null>(null);
  const [switchClusterDialogMessage, setSwitchClusterDialogMessage] = useState('');

  const [actionLoading, setActionLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  const [credUser, setCredUser] = useState('');
  const [credPassword, setCredPassword] = useState('');
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkDialogType, setBulkDialogType] = useState<'setup-idle' | 'switch-os'>('setup-idle');

  const loadNodes = useCallback(async (showToast = false) => {
    if (!token) return;
    try {
      setRefreshing(true);
      setError('');
      const response = await devNodesApi.getNodes(token);
      setNodes(response.data || []);
      if (showToast) toast.success('Node inventory refreshed');
    } catch (error) {
      console.error('Failed to load node management inventory', error);
      setError('Unable to load registered nodes');
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

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSetupIdleClick = (node: ManagedNode) => {
    setSetupIdleDialogNode(node);
    setCredUser(node.ssh_username || '');
    setCredPassword(node.ssh_password || '');
    setSetupIdleDialogOpen(true);
  };

  const confirmSetupIdle = async () => {
    if (!token || !setupIdleDialogNode) return;
    setSetupIdleDialogOpen(false);
    setActionLoading(true);
    const creds = credUser || credPassword ? { ansible_user: credUser, ansible_password: credPassword } : undefined;
    try {
      const response = await windowsNodesApi.setupIdle(token, setupIdleDialogNode.id, creds);
      if (response.data.status === 'success') {
        toast.success(response.data.message);
      } else {
        toast.error(response.data.message);
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Setup Idle failed';
      toast.error(msg);
    } finally {
      setActionLoading(false);
      loadNodes();
    }
  };

  const handleSwitchToClusterClick = (node: ManagedNode) => {
    setSwitchClusterDialogNode(node);
    setCredUser(node.ssh_username || '');
    setCredPassword(node.ssh_password || '');
    const uptimeSeconds = node.uptime_seconds;
    const hasValidUptime = uptimeSeconds !== null && uptimeSeconds !== undefined && uptimeSeconds > 0;
    const oneHour = 3600;

    if (hasValidUptime && uptimeSeconds! < oneHour) {
      setSwitchClusterDialogMessage(
        'The node has not yet reached the scheduled idle duration. Are you sure you want to switch the OS now?'
      );
    } else {
      setSwitchClusterDialogMessage('Are you sure you want to switch the operating system?');
    }

    setSwitchClusterDialogOpen(true);
  };

  const confirmSwitchToCluster = async () => {
    if (!token || !switchClusterDialogNode) return;
    setSwitchClusterDialogOpen(false);
    setActionLoading(true);
    const creds = credUser || credPassword ? { ansible_user: credUser, ansible_password: credPassword } : undefined;

    try {
      const response = await windowsNodesApi.switchOs(token, switchClusterDialogNode.id, creds);
      if (response.data.status === 'success') {
        toast.success(response.data.message);
      } else {
        toast.error(response.data.message);
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Operation failed';
      toast.error(msg);
    } finally {
      setActionLoading(false);
      loadNodes();
    }
  };

  const handleBulkSetupIdle = () => {
    setBulkDialogType('setup-idle');
    setCredUser('');
    setCredPassword('');
    setBulkDialogOpen(true);
  };

  const handleBulkSwitchToCluster = () => {
    setBulkDialogType('switch-os');
    setCredUser('');
    setCredPassword('');
    setBulkDialogOpen(true);
  };

  const confirmBulkAction = async () => {
    if (!token || selectedIds.size === 0) return;
    setBulkDialogOpen(false);
    setBulkLoading(true);
    const ids = Array.from(selectedIds);
    const creds = credUser || credPassword ? { ansible_user: credUser, ansible_password: credPassword } : undefined;
    try {
      const response = bulkDialogType === 'setup-idle'
        ? await windowsNodesApi.bulkSetupIdle(token, ids, creds)
        : await windowsNodesApi.bulkSwitchOs(token, ids, creds);
      const { results, successful } = response.data;
      const label = bulkDialogType === 'setup-idle' ? 'Setup idle' : 'Switch to cluster';
      if (successful === results.length) {
        toast.success(`${label} completed for all ${successful} nodes`);
      } else if (successful > 0) {
        toast.warning(`${label} completed for ${successful}/${results.length} nodes. Check individual results.`);
      } else {
        toast.error(`${label} failed for all nodes`);
      }
      results.forEach((r) => {
        if (r.status !== 'success') {
          toast.error(r.message, { id: `bulk-${bulkDialogType}-${r.node_id}` });
        }
      });
      setSelectedIds(new Set());
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Bulk operation failed';
      toast.error(msg);
    } finally {
      setBulkLoading(false);
      loadNodes();
    }
  };

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1500px] space-y-5">
        <div className="flex flex-col items-center justify-center min-h-[400px] rounded-xl border border-dashed border-red-200 bg-red-50/70 px-6 py-12 text-center">
          <Server className="mb-3 h-10 w-10 text-red-300" />
          <p className="text-base font-bold text-red-900">Failed to load nodes</p>
          <p className="mt-1 text-sm text-red-500">{error}</p>
          <Button onClick={() => { setLoading(true); setError(''); loadNodes(); }} className="mt-4" variant="outline">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (loading) return <PageLoader message="Loading node management..." />;

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-gray-950">Node Management</h1>
          <p className="mt-1 text-sm text-gray-500 flex items-center gap-2">
            {refreshing ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Refreshing...
              </span>
            ) : (
              `${nodes.length} registered nodes`
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => loadNodes(true)}
          disabled={refreshing || actionLoading || bulkLoading}
          className="h-10 gap-2 border-gray-200 bg-white font-bold"
        >
          <RefreshCcw className={cn('h-4 w-4', (refreshing || actionLoading) && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <NodeColumn
          title="Ubuntu Nodes"
          description="Linux compute nodes with slurmd service status."
          family="ubuntu"
          nodes={grouped.ubuntu}
          search={searchUbuntu}
          onSearchChange={setSearchUbuntu}
          selectedIds={selectedIds}
          onSelect={toggleSelect}
          onSetupIdle={handleSetupIdleClick}
          onSwitchToCluster={handleSwitchToClusterClick}
        />
        <NodeColumn
          title="Windows Nodes"
          description="Windows compute nodes with slurmd service status."
          family="windows"
          nodes={grouped.windows}
          search={searchWindows}
          onSearchChange={setSearchWindows}
          selectedIds={selectedIds}
          onSelect={toggleSelect}
          onSetupIdle={handleSetupIdleClick}
          onSwitchToCluster={handleSwitchToClusterClick}
          bulkSetupIdle={handleBulkSetupIdle}
          bulkSwitchToCluster={handleBulkSwitchToCluster}
          bulkLoading={bulkLoading}
        />
      </div>

      <AlertDialog open={setupIdleDialogOpen} onOpenChange={setSetupIdleDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Setup Idle Configuration</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-gray-500">
                <span>This will configure the node to boot into Ubuntu on the next restart and set up an idle scheduler with a 1-hour grace period.</span>
                <span className="block font-medium text-gray-700">The node will not be restarted at this stage.</span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 px-6 pb-4">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 block">WinRM Username</label>
              <Input
                value={credUser}
                onChange={(e) => setCredUser(e.target.value)}
                placeholder="Administrator"
                className="h-9 text-xs rounded-md"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 block">WinRM Password</label>
              <Input
                type="password"
                value={credPassword}
                onChange={(e) => setCredPassword(e.target.value)}
                placeholder="Enter password"
                className="h-9 text-xs rounded-md"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSetupIdle} className="bg-sky-600 hover:bg-sky-700">
              Confirm Setup
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={switchClusterDialogOpen} onOpenChange={setSwitchClusterDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm OS Switch</AlertDialogTitle>
            <AlertDialogDescription>
              {switchClusterDialogMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 px-6 pb-4">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 block">WinRM Username</label>
              <Input
                value={credUser}
                onChange={(e) => setCredUser(e.target.value)}
                placeholder="Administrator"
                className="h-9 text-xs rounded-md"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 block">WinRM Password</label>
              <Input
                type="password"
                value={credPassword}
                onChange={(e) => setCredPassword(e.target.value)}
                placeholder="Enter password"
                className="h-9 text-xs rounded-md"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSwitchToCluster} className="bg-amber-600 hover:bg-amber-700">
              Switch to Cluster
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{bulkDialogType === 'setup-idle' ? 'Bulk Setup Idle' : 'Bulk Switch to Cluster'}</AlertDialogTitle>
            <AlertDialogDescription>
              This will run the operation on {selectedIds.size} selected Windows node{selectedIds.size !== 1 ? 's' : ''}. Provide WinRM credentials to use for all nodes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 px-6 pb-4">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 block">WinRM Username</label>
              <Input
                value={credUser}
                onChange={(e) => setCredUser(e.target.value)}
                placeholder="Administrator"
                className="h-9 text-xs rounded-md"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 block">WinRM Password</label>
              <Input
                type="password"
                value={credPassword}
                onChange={(e) => setCredPassword(e.target.value)}
                placeholder="Enter password"
                className="h-9 text-xs rounded-md"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkAction} className={bulkDialogType === 'setup-idle' ? 'bg-sky-600 hover:bg-sky-700' : 'bg-amber-600 hover:bg-amber-700'}>
              {bulkDialogType === 'setup-idle' ? 'Confirm Setup' : 'Switch to Cluster'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
