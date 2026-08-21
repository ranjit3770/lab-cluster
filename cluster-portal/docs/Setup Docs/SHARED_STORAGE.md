To have a professional Slurm cluster, you need **Shared Storage**. Without it, a job submitted on the head node will save its output to the worker's local hard drive, making it "invisible" to you from the head node.

We will use **NFS (Network File System)**. The Head Node will act as the "Server" (storing the files), and the Workers will be the "Clients" (mounting the folder).

---

## 📂 Slurm Shared Storage Documentation (NFS)

### 1. Head Node Setup (The Server)
Run these commands on **cluster-hn** (192.168.196.250).

* **Install the NFS Server:**
    ```bash
    sudo apt update
    sudo apt install nfs-kernel-server -y
    ```
* **Create the Shared Directory:**
    We will create a folder called `/home/slurm_shared`.
    ```bash
    sudo mkdir -p /home/slurm_shared
    sudo chown -R slurm:slurm /home/slurm_shared
    sudo chmod 777 /home/slurm_shared
    ```
* **Export the Directory:**
    Edit the exports file to allow your worker nodes to access this folder.
    ```bash
    sudo nano /etc/exports
    ```
    Add this line at the bottom:
    ```text
    /home/slurm_shared 192.168.196.0/24(rw,sync,no_root_squash,no_subtree_check)
    ```
* **Apply Changes:**
    ```bash
    sudo exportfs -ra
    sudo systemctl restart nfs-kernel-server
    ```

---

### 2. Worker Node Setup (The Clients)
Run these commands on **worker1** and **worker2**.

* **Install NFS Client:**
    ```bash
    sudo apt update
    sudo apt install nfs-common -y
    ```
* **Create the Mount Point:**
    ```bash
    sudo mkdir -p /home/slurm_shared
    ```
* **Mount the Folder:**
    ```bash
    sudo mount 192.168.196.250:/home/slurm_shared /home/slurm_shared
    ```
* **Make it Permanent:**
    To ensure the storage reconnects after a reboot, edit `/etc/fstab`:
    ```bash
    sudo nano /etc/fstab
    ```
    Add this line at the bottom:
    ```text
    192.168.196.250:/home/slurm_shared /home/slurm_shared nfs defaults 0 0
    ```



---

### 3. Testing the Shared Storage
1.  **On the Head Node:**
    ```bash
    touch /home/slurm_shared/hello_from_head
    ```
2.  **On worker1:**
    ```bash
    ls /home/slurm_shared/
    ```
    *If you see `hello_from_head`, your shared storage is working perfectly!*

---

### 4. Running Slurm Jobs via NFS
Now, whenever you run a job, you **must** be inside the shared folder. This ensures the worker node can see the script and the head node can see the logs.

**New Workflow:**
```bash
# 1. Go to the shared folder
cd /home/slurm_shared

# 2. Put your script there
cp ~/submit_gpu_job.sh .

# 3. Submit from here
sbatch submit_gpu_job.sh

# 4. Check the results (they will appear here immediately)
ls -l gpu_job_*.log
```

---

### 💡 Why this is better
* **Centralized Logs:** No more `ssh worker1` just to read a log file.
* **One Script, Many Nodes:** You only need one copy of your Python/C++ code.
* **Consistency:** Every node sees the exact same file version at the same time.



**Would you like me to show you how to move your Munge key or Slurm configs into this shared folder to make cluster updates even easier?**
