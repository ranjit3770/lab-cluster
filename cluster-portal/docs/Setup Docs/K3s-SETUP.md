This is a powerful "Converged Infrastructure" setup. By combining **Slurm** (High-Performance Computing) and **K3s** (Cloud-Native Orchestration), you are essentially building a private cloud that can handle both batch jobs and microservices.

Here is the fully updated document incorporating the **Ubuntu Noble (24.04)** Intel GPU drivers, the **K3s server/agent** setup, and the specific **Device Plugin** fixes we identified.

---

# 🚀 Converged Cluster Setup Guide: K3s + Slurm + Intel GPU
**Environment:** Ubuntu 24.04 (Noble)  
**Architecture:** Head Node (`cluster-hn`) + Worker Nodes (`22CPU0402L`, `node3`, `node4`)

---

## 1. Host Preparation (Run on ALL Worker Nodes)
Before joining K3s or Slurm, the hardware must be ready. This ensures the Intel UHD 770 is visible to both "bosses."

```bash
# 1. Add Intel Graphics Repository for Ubuntu Noble
wget -qO - https://repositories.intel.com/gpu/intel-graphics.key | sudo gpg --yes --dearmor --output /usr/share/keyrings/intel-graphics.gpg
echo "deb [arch=amd64,i386 signed-by=/usr/share/keyrings/intel-graphics.gpg] https://repositories.intel.com/gpu/ubuntu noble unified" | sudo tee /etc/apt/sources.list.d/intel-gpu-noble.list

# 2. Install Drivers, Runtimes, and Discovery Tools
sudo apt update
sudo apt install -y libze-intel-gpu1 libze1 intel-opencl-icd clinfo intel-media-va-driver-non-free

# 3. Verify Hardware
clinfo | grep "Device Name"
ls -l /dev/dri  # Should see card0 and renderD128
```

---

## 2. K3s Control Plane (Head Node: `cluster-hn`)
On the node acting as the Slurm Controller and NFS Server:

```bash
# Install K3s Server (disabling Traefik to save resources for Slurm)
curl -sfL https://get.k3s.io | sh -s - server --disable traefik

# Capture the join token for workers
sudo cat /var/lib/rancher/k3s/server/node-token
```

---

## 3. K3s Agents (Worker Nodes)
On each worker node, join the K3s cluster. 
*Note: Run your `provision_worker.sh` (Slurm/NFS) before this step.*

```bash
curl -sfL https://get.k3s.io | K3S_URL=https://<CLUSTER_HN_IP>:6443 \
K3S_TOKEN=<YOUR_TOKEN> sh -
```

---

## 4. Intel GPU Integration for Kubernetes
This is where we solve the "ImagePullBackOff" and "Version too low" issues.



### A. Deploy the Operator
```bash
kubectl apply -f https://raw.githubusercontent.com/intel/intel-device-plugins-for-kubernetes/main/deployments/operator/samples/deviceplugin.intel.com_gpudeviceplugins.yaml
```

### B. Configure the GPU Plugin (`intel-gpu-plugin.yaml`)
Create this file to bridge the hardware to K3s. **Note the specific version tag `0.35.0` (no 'v')** to satisfy the admission webhook and Docker Hub.

```yaml
apiVersion: deviceplugin.intel.com/v1
kind: GpuDevicePlugin
metadata:
  name: gpu-plugin
  namespace: intel-device-plugins
spec:
  # Satisfies webhook (>= 0.35.0) and Registry (exists on Docker Hub)
  image: intel/intel-gpu-plugin:0.35.0
  sharedDevNum: 1
```

**Apply it:**
```bash
kubectl apply -f intel-gpu-plugin.yaml
```

---

## 5. Resource Management (The "Double Boss" Fix)
To prevent K3s from stealing RAM that Slurm needs (or vice versa), we reserve resources for the system/Slurm on the workers.

Edit `/etc/systemd/system/k3s-agent.service.env` on your workers:
```text
# Reserve 2 CPUs and 2GB RAM for Slurm/OS
K3S_AGENT_ARGS='--kubelet-arg="system-reserved=cpu=2,memory=2Gi"'
```
Restart K3s Agent: `sudo systemctl daemon-reload && sudo systemctl restart k3s-agent`

---

## 6. Verification Checklist

| Test | Command | Expected Result |
| :--- | :--- | :--- |
| **Hardware** | `clinfo` | Intel(R) UHD Graphics 770 |
| **K8s Pods** | `kubectl get pods -n intel-device-plugins` | `Running` (not ImagePullBackOff) |
| **K8s GPU** | `kubectl describe node <name> | grep gpu` | `gpu.intel.com/i915: 1` |
| **Slurm** | `sinfo` | All nodes `idle` or `alloc` |

---

### Final Check
Now that your GPU is recognized by K3s, you can run workloads using the resource limit `gpu.intel.com/i915: 1`. 

**Would you like a sample Pod manifest for an Intel-optimized AI workload (like OpenVINO) to test the end-to-end setup?**
