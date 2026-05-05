### How to Fix the down State

1. Check the "Reason" Slurm gave for the down state:
```bash
scontrol show node cluster-hn | grep Reason
```

2. Forced Resume:
```bash
sudo scontrol update nodename=cluster-hn state=resume
```

3. Verify the Fix:
```bash
sinfo
```
