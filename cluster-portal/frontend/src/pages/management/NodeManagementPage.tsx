import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
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
} from 'lucide-react';
import { toast } from 'sonner';

import { devNodesApi, type DevNode } from '@/api/devNodes';
import { windowsNodesApi } from '@/api/windowsNodes';
import { useAuth } from '@/context/AuthContext';
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
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type NodeFamily = 'ubuntu' | 'windows';

type ManagedNode = DevNode & {
  family: NodeFamily;
  detectionReason: string;
  isLiveDetected: boolean;
};

const WINDOWS_PORTS = new Set([3389, 5985, 5986]);

function classifyNode(node: DevNode): ManagedNode {
  if (node.auto_discovered) {
    const autoFamily = node.effective_os_family?.toLowerCase() === 'windows' ? 'windows' : 'ubuntu';
    return {
      ...node,
      family: autoFamily,
      detectionReason: 'auto-discovered from Slurm',
      isLiveDetected: true,
    };
  }

  const runtimeFamily = node.effective_os_family?.toLowerCase();
  if (runtimeFamily === 'ubuntu' || runtimeFamily === 'windows') {
    return {
      ...node,
      family: runtimeFamily,
      detectionReason: node.detection_source || (node.detected_os_family ? 'live detected' : 'saved admin setting'),
      isLiveDetected: Boolean(node.detected_os_family && node.detected_reachable),
    };
  }

  const explicitFamily = node.os_family?.toLowerCase();
  if (explicitFamily === 'ubuntu' || explicitFamily === 'windows') {
    return {
      ...node,
      family: explicitFamily,
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

function NodeTile({ node, onSetupIdle, onSwitchOs }: {
  node: ManagedNode;
  onSetupIdle: (node: ManagedNode) => void;
  onSwitchOs: (node: ManagedNode) => void;
}) {
  const isWindows = node.family === 'windows';
  const isAuto = node.auto_discovered;
  const Icon = isWindows ? Monitor : Server;

  const handleSetupIdle = () => {
    onSetupIdle(node);
  };

  const handleSwitchOs = () => {
    onSwitchOs(node);
  };

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
            {node.isLiveDetected ? 'live ' : ''}{node.family}
          </Badge>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {isWindows ? (
          <>
            <div className="col-span-2 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleSetupIdle}
                className="gap-2 border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-800 font-black text-xs uppercase tracking-wider h-10"
              >
                <Play className="h-4 w-4" />
                Setup Idle
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleSwitchOs}
                className="gap-2 border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800 font-black text-xs uppercase tracking-wider h-10"
              >
                <ArrowRight className="h-4 w-4" />
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

      <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between">
        <span className="inline-flex items-center gap-1.5">
          <Laptop className="h-3.5 w-3.5" />
          {node.detectionReason}
        </span>
        {!isAuto && (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 font-bold',
              node.detected_reachable ? 'text-emerald-600' : 'text-amber-600'
            )}
          >
            <span className={cn('h-2 w-2 rounded-full', node.detected_reachable ? 'bg-emerald-500' : 'bg-amber-400')} />
            {node.detected_reachable ? 'reachable' : 'fallback'}
          </span>
        )}
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
  onSetupIdle,
  onSwitchOs,
}: {
  title: string;
  description: string;
  family: NodeFamily;
  nodes: ManagedNode[];
  onSetupIdle: (node: ManagedNode) => void;
  onSwitchOs: (node: ManagedNode) => void;
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

      <div className="max-h-[calc(100vh-260px)] grid grid-cols-1 gap-3 overflow-y-auto p-4 md:grid-cols-2">
        {nodes.length > 0 ? nodes.map((node) => (
          <NodeTile
            key={node.id}
            node={node}
            onSetupIdle={onSetupIdle}
            onSwitchOs={onSwitchOs}
          />
        )) : (
          <div className="col-span-1 md:col-span-2"><EmptyColumn family={family} /></div>
        )}
      </div>
    </Card>
  );
}

export default function NodeManagementPage() {
  const { token } = useAuth();
  const [nodes, setNodes] = useState<DevNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogNode, setDialogNode] = useState<ManagedNode | null>(null);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');
  const [dialogDescription, setDialogDescription] = useState('');
  const [dialogAction, setDialogAction] = useState<'setup-idle' | 'switch-os' | null>(null);
  const [dialogConfirmText, setDialogConfirmText] = useState('Confirm');
  const [actionLoading, setActionLoading] = useState(false);

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

  const handleSetupIdleClick = (node: ManagedNode) => {
    setDialogNode(node);
    setDialogTitle('Setup Idle Configuration');
    setDialogDescription(
      'This will configure the node to boot into Ubuntu on next restart and set up a 1-hour idle scheduler.'
    );
    setDialogMessage(
      'GRUB will be updated to set Ubuntu as the default boot entry without restarting the node. An idle scheduler will be configured to automatically switch after 1 hour of inactivity.'
    );
    setDialogConfirmText('Setup Idle');
    setDialogAction('setup-idle');
    setDialogOpen(true);
  };

  const handleSwitchOsClick = (node: ManagedNode) => {
    setDialogNode(node);
    setDialogTitle('Switch to Cluster');
    const uptimeSeconds = node.uptime_seconds || 0;
    const oneHour = 3600;

    if (!node.uptime_seconds || node.uptime === 'N/A') {
      setDialogMessage(
        'The node has not yet reached the scheduled idle duration. Are you sure you want to switch the OS now?'
      );
    } else if (uptimeSeconds > 0 && uptimeSeconds < oneHour) {
      setDialogMessage(
        'The node has not yet reached the scheduled idle duration. Are you sure you want to switch the OS now?'
      );
    } else {
      setDialogMessage('Are you sure you want to switch the operating system?');
    }

    setDialogDescription('');
    setDialogConfirmText('Switch to Cluster');
    setDialogAction('switch-os');
    setDialogOpen(true);
  };

  const executeSetupIdle = async (node: ManagedNode) => {
    if (!token) return;
    setActionLoading(true);
    try {
      const response = await windowsNodesApi.setupIdle(token, node.id);
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
      loadNodes(true);
    }
  };

  const executeSwitchOs = async (node: ManagedNode) => {
    if (!token) return;
    setActionLoading(true);
    try {
      const response = await windowsNodesApi.switchOs(token, node.id);
      if (response.data.status === 'success') {
        toast.success(response.data.message);
      } else {
        toast.error(response.data.message);
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Switch OS failed';
      toast.error(msg);
    } finally {
      setActionLoading(false);
      loadNodes(true);
    }
  };

  const handleDialogConfirm = async () => {
    if (!token || !dialogNode || !dialogAction) return;
    setDialogOpen(false);

    if (dialogAction === 'setup-idle') {
      await executeSetupIdle(dialogNode);
    } else if (dialogAction === 'switch-os') {
      await executeSwitchOs(dialogNode);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-gray-950">Node Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Registered nodes with slurmd service status and system uptime.
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
            description="Linux compute nodes with slurmd service status."
            family="ubuntu"
            nodes={grouped.ubuntu}
            onSetupIdle={handleSetupIdleClick}
            onSwitchOs={handleSwitchOsClick}
          />
          <NodeColumn
            title="Windows Nodes"
            description="Windows compute nodes with slurmd service status."
            family="windows"
            nodes={grouped.windows}
            onSetupIdle={handleSetupIdleClick}
            onSwitchOs={handleSwitchOsClick}
          />
        </div>
      )}

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
            {dialogDescription && (
              <AlertDialogDescription className="text-xs text-gray-500 border-l-2 border-sky-200 pl-3 mt-2">
                {dialogDescription}
              </AlertDialogDescription>
            )}
            <AlertDialogDescription className="text-sm">
              {dialogMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDialogConfirm}
              disabled={actionLoading}
              className={cn(
                dialogAction === 'setup-idle' ? 'bg-sky-600 hover:bg-sky-700' : 'bg-amber-600 hover:bg-amber-700'
              )}
            >
              {actionLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : null}
              {dialogConfirmText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
