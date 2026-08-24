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
import { useAuth } from '@/context/useAuth'
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
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { apiErrorMessage } from "@/api/errors";

type NodeFamily = 'ubuntu' | 'windows';

type ManagedNode = DevNode & {
  family: NodeFamily;
  detectionReason: string;
};

const WINDOWS_PORTS = new Set([3389, 5985, 5986]);

const FIELD_LABEL_CLASS = 'mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground';

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
    <EmptyState
      icon={Network}
      title={`No ${label.toLowerCase()} registered`}
      description="Add nodes in Slurm configuration to see them here."
      className="min-h-[220px] justify-center"
    />
  );
}

const slurmdStatusConfig: Record<string, { label: string; dotClass: string; badgeClass: string }> = {
  active: {
    label: 'Active',
    dotClass: 'bg-success',
    badgeClass: 'border-success/20 bg-success/10 text-success',
  },
  inactive: {
    label: 'Inactive',
    dotClass: 'bg-destructive',
    badgeClass: 'border-destructive/20 bg-destructive/10 text-destructive',
  },
  failed: {
    label: 'Failed',
    dotClass: 'bg-destructive',
    badgeClass: 'border-destructive/20 bg-destructive/10 text-destructive',
  },
  'not-found': {
    label: 'Not Found',
    dotClass: 'bg-warning',
    badgeClass: 'border-warning/25 bg-warning/10 text-warning',
  },
  not_found: {
    label: 'Not Found',
    dotClass: 'bg-warning',
    badgeClass: 'border-warning/25 bg-warning/10 text-warning',
  },
  activating: {
    label: 'Activating',
    dotClass: 'bg-info',
    badgeClass: 'border-info/20 bg-info/10 text-info',
  },
  unknown: {
    label: 'Unknown',
    dotClass: 'bg-muted-foreground/60',
    badgeClass: 'border-border bg-muted text-muted-foreground',
  },
};

function SlurmdBadge({ status }: { status?: string | null }) {
  const config = slurmdStatusConfig[status || 'unknown'] || slurmdStatusConfig.unknown;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium', config.badgeClass)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', config.dotClass)} />
      {config.label}
    </span>
  );
}

function UptimeValue({ uptime, uptimeSeconds }: { uptime?: string | null; uptimeSeconds?: number | null }) {
  if (!uptime || uptime === 'N/A') {
    return <span className="text-sm font-medium text-muted-foreground">N/A</span>;
  }
  return (
    <span className="text-sm font-semibold tabular-nums text-foreground" title={uptimeSeconds ? `${uptimeSeconds}s` : undefined}>
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
      'rounded-lg border p-3 shadow-xs transition-colors',
      selected ? 'border-info/40 bg-info/10' : 'border-border bg-card hover:border-ring/40'
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          {isWindows && (
            <button onClick={() => onSelect(node.id)} className="mt-0.5 shrink-0 cursor-pointer" aria-label={`Select ${node.name}`}>
              {selected ? (
                <CheckSquare className="h-4.5 w-4.5 text-info" />
              ) : (
                <Square className="h-4.5 w-4.5 text-muted-foreground/40 transition-colors hover:text-muted-foreground" />
              )}
            </button>
          )}
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border',
              isWindows
                ? 'border-info/20 bg-info/10 text-info'
                : 'border-success/20 bg-success/10 text-success'
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {node.name}
            </h3>
            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
              {node.ip_address || 'No IP registered'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isAuto && (
            <Badge
              variant="outline"
              className="border-primary/20 bg-primary/10 text-[10px] font-semibold uppercase tracking-wide text-primary"
            >
              Slurm
            </Badge>
          )}
          <Badge
            variant="outline"
            className={cn(
              'shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              isWindows
                ? 'border-info/20 bg-info/10 text-info'
                : 'border-success/20 bg-success/10 text-success'
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
                className="h-8 flex-1 gap-1.5 border-info/25 bg-info/10 px-2 text-[10px] font-semibold uppercase tracking-wider text-info hover:bg-info/20 hover:text-info"
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
                className="h-8 flex-1 gap-1.5 border-warning/25 bg-warning/10 px-2 text-[10px] font-semibold uppercase tracking-wider text-warning hover:bg-warning/20 hover:text-warning"
              >
                {switchOsLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowRight className="h-3.5 w-3.5" />
                )}
                Switch to Cluster
              </Button>
            </div>
            <div className="col-span-2 rounded-md border border-border bg-muted/40 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <Timer className="h-3 w-3" />
                Uptime
              </div>
              <div className="mt-1">
                {isAuto ? (
                  <span className="text-xs font-medium text-muted-foreground">No SSH</span>
                ) : (
                  <UptimeValue uptime={node.uptime} uptimeSeconds={node.uptime_seconds} />
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <Activity className="h-3 w-3" />
                Slurmd Service
              </div>
              <div className="mt-1">
                <SlurmdBadge status={node.slurmd_status} />
              </div>
            </div>
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <Timer className="h-3 w-3" />
                Uptime
              </div>
              <div className="mt-1">
                {isAuto ? (
                  <span className="text-xs font-medium text-muted-foreground">No SSH</span>
                ) : (
                  <UptimeValue uptime={node.uptime} uptimeSeconds={node.uptime_seconds} />
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Laptop className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{node.detectionReason}</span>
        </span>
        {!isAuto && (
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 font-medium',
              node.detected_reachable ? 'text-success' : 'text-warning'
            )}
          >
            <span className={cn('h-2 w-2 rounded-full', node.detected_reachable ? 'bg-success' : 'bg-warning')} />
            {node.detected_reachable ? 'reachable' : 'fallback'}
          </span>
        )}
        <span className="inline-flex shrink-0 items-center gap-1.5">
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

  // Reset to page 1 when the filter or data set changes (during-render
  // adjustment instead of a synchronous setState inside an effect).
  const [prevReset, setPrevReset] = useState<{ search: string; nodes: typeof nodes }>({
    search,
    nodes,
  });
  if (prevReset.search !== search || prevReset.nodes !== nodes) {
    setPrevReset({ search, nodes });
    setPage(1);
  }

  const hasSelection = selectedIds.size > 0;

  return (
    <Card className="flex flex-col overflow-hidden rounded-lg border-border shadow-xs">
      <div className="border-b border-border bg-muted/40 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          </div>
          <Badge
            variant="outline"
            className={cn(
              'shrink-0 tabular-nums',
              isWindows
                ? 'border-info/20 bg-info/10 text-info'
                : 'border-success/20 bg-success/10 text-success'
            )}
          >
            {filtered.length}
          </Badge>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            placeholder={`Search ${family} nodes...`}
            className="h-8 pl-8 text-xs"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        {isWindows && hasSelection && (
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={bulkSetupIdle}
              disabled={bulkLoading}
              className="h-8 flex-1 gap-1 border-info/25 bg-info/10 text-[10px] font-semibold uppercase tracking-wider text-info hover:bg-info/20 hover:text-info"
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
              className="h-8 flex-1 gap-1 border-warning/25 bg-warning/10 text-[10px] font-semibold uppercase tracking-wider text-warning hover:bg-warning/20 hover:text-warning"
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

      <div className="custom-scrollbar grid flex-1 grid-cols-1 content-start gap-3 overflow-y-auto p-4 md:grid-cols-2">
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
              <div className="flex min-h-[120px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center">
                <Search className="mb-2 h-6 w-6 text-muted-foreground/50" aria-hidden />
                <p className="text-sm font-medium text-muted-foreground">No matching nodes</p>
              </div>
            )}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2">
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-7 w-7 p-0"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-7 w-7 p-0"
              aria-label="Next page"
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
    } catch (err) {
      const msg = apiErrorMessage(err, 'Setup Idle failed');
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
    } catch (err) {
      const msg = apiErrorMessage(err, 'Operation failed');
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
    } catch (err) {
      const msg = apiErrorMessage(err, 'Bulk operation failed');
      toast.error(msg);
    } finally {
      setBulkLoading(false);
      loadNodes();
    }
  };

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1500px] space-y-5">
        <div className="flex min-h-[400px] flex-col items-center justify-center rounded-lg border border-dashed border-destructive/30 bg-destructive/5 px-6 py-12 text-center">
          <Server className="mb-3 h-10 w-10 text-destructive/50" aria-hidden />
          <p className="text-base font-semibold text-destructive">Failed to load nodes</p>
          <p className="mt-1 text-sm text-destructive/80">{error}</p>
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
      <PageHeader
        title="Node Management"
        description={
          refreshing ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Refreshing...
            </span>
          ) : (
            `${nodes.length} registered nodes`
          )
        }
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => loadNodes(true)}
            disabled={refreshing || actionLoading || bulkLoading}
            className="gap-2"
          >
            <RefreshCcw className={cn('h-3.5 w-3.5', (refreshing || actionLoading) && 'animate-spin')} />
            Refresh
          </Button>
        }
      />

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
              <div className="space-y-2 text-sm text-muted-foreground">
                <span>This will configure the node to boot into Ubuntu on the next restart and set up an idle scheduler with a 1-hour grace period.</span>
                <span className="block font-medium text-foreground">The node will not be restarted at this stage.</span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 px-6 pb-4">
            <div>
              <label className={FIELD_LABEL_CLASS}>WinRM Username</label>
              <Input
                value={credUser}
                onChange={(e) => setCredUser(e.target.value)}
                placeholder="Administrator"
                className="h-9 text-xs"
              />
            </div>
            <div>
              <label className={FIELD_LABEL_CLASS}>WinRM Password</label>
              <Input
                type="password"
                value={credPassword}
                onChange={(e) => setCredPassword(e.target.value)}
                placeholder="Enter password"
                className="h-9 text-xs"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSetupIdle}>
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
              <label className={FIELD_LABEL_CLASS}>WinRM Username</label>
              <Input
                value={credUser}
                onChange={(e) => setCredUser(e.target.value)}
                placeholder="Administrator"
                className="h-9 text-xs"
              />
            </div>
            <div>
              <label className={FIELD_LABEL_CLASS}>WinRM Password</label>
              <Input
                type="password"
                value={credPassword}
                onChange={(e) => setCredPassword(e.target.value)}
                placeholder="Enter password"
                className="h-9 text-xs"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSwitchToCluster} className="bg-warning text-warning-foreground shadow-xs hover:bg-warning/90">
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
              <label className={FIELD_LABEL_CLASS}>WinRM Username</label>
              <Input
                value={credUser}
                onChange={(e) => setCredUser(e.target.value)}
                placeholder="Administrator"
                className="h-9 text-xs"
              />
            </div>
            <div>
              <label className={FIELD_LABEL_CLASS}>WinRM Password</label>
              <Input
                type="password"
                value={credPassword}
                onChange={(e) => setCredPassword(e.target.value)}
                placeholder="Enter password"
                className="h-9 text-xs"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkAction}
              className={bulkDialogType === 'setup-idle' ? undefined : 'bg-warning text-warning-foreground shadow-xs hover:bg-warning/90'}
            >
              {bulkDialogType === 'setup-idle' ? 'Confirm Setup' : 'Switch to Cluster'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
