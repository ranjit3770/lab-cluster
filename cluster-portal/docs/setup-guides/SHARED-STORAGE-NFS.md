# Shared Storage With NFS

A professional Slurm cluster needs shared storage. Without it, a job submitted
on the head node writes its output to the worker's local disk, making results
invisible from the head node.

Design: the head node is the NFS **server** (stores files); workers are
**clients** (mount the folder).

## 1. Head Node Setup (Server)

Run on `cluster-hn` (192.168.196.250).

Install the NFS server:

```bash
sudo apt update
sudo apt install nfs-kernel-server -y
```

Create the shared directory:

```bash
sudo mkdir -p /home/slurm_shared
sudo chown -R slurm:slurm /home/slurm_shared
sudo chmod 777 /home/slurm_shared
```

Export it to the worker subnet — add to `/etc/exports`:

```text
/home/slurm_shared 192.168.196.0/24(rw,sync,no_root_squash,no_subtree_check)
```

Apply:

```bash
sudo exportfs -ra
sudo systemctl restart nfs-kernel-server
```

## 2. Worker Node Setup (Clients)

Run on each worker (`worker1`, `worker2`).

```bash
sudo apt update
sudo apt install nfs-common -y
sudo mkdir -p /home/slurm_shared
sudo mount 192.168.196.250:/home/slurm_shared /home/slurm_shared
```

Make the mount permanent — add to `/etc/fstab`:

```text
192.168.196.250:/home/slurm_shared /home/slurm_shared nfs defaults 0 0
```

## 3. Verify The Share

```bash
# on the head node
touch /home/slurm_shared/hello_from_head

# on worker1
ls /home/slurm_shared/
# -> hello_from_head means the share works
```

## 4. Running Jobs From The Shared Folder

Always launch jobs from inside the shared folder so every node sees the same
script and logs:

```bash
cd /home/slurm_shared
cp ~/submit_gpu_job.sh .
sbatch submit_gpu_job.sh
ls -l gpu_job_*.log   # results appear here immediately
```

## Why Shared Storage Matters

- **Centralized logs** — no `ssh worker1` just to read an output file.
- **One script, many nodes** — a single copy of user code.
- **Consistency** — all nodes see identical file contents at the same time.
