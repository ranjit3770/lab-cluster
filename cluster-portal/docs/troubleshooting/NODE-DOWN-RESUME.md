# Node Stuck In DOWN State

How to diagnose and clear a Slurm node stuck in `DOWN`.

## 1. Check The Reason

Slurm records why it marked the node down:

```bash
scontrol show node cluster-hn | grep Reason
```

Fix the underlying cause first if it is actionable (unreachable node, failed
`slurmd`, expired Munge credential).

## 2. Force Resume

If the node is actually healthy again:

```bash
sudo scontrol update nodename=cluster-hn state=resume
```

## 3. Verify

```bash
sinfo
```

The node should now show `idle` or `alloc`.

> For dual-boot workers that return from Windows, a cron watchdog automates
> this: [`scripts/slurm-resume-nodes.sh`](../../../scripts/README.md) probes
> SSH on DOWN nodes and resumes those answering from Linux.
