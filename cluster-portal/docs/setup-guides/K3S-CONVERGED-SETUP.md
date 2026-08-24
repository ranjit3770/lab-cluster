# Converged Cluster Setup: K3s + Slurm + Intel GPU

A "converged infrastructure" setup combining Slurm (HPC batch workloads) and
K3s (cloud-native microservices) on the same nodes, with Intel GPU access for
both.

- **Environment:** Ubuntu 24.04 (Noble)
- **Architecture:** head node (`cluster-hn`) + worker nodes (`22CPU0402L`, `node3`, `node4`)

## 1. Host Preparation (All Worker Nodes)

Make the Intel UHD 770 visible to both orchestrators before joining K3s or
Slurm:

```bash
# 1. Add Intel graphics repository for Ubuntu Noble
wget -qO - https://repositories.intel.com/gpu/intel-graphics.key | sudo gpg --yes --dearmor --output /usr/share/keyrings/intel-graphics.gpg
echo "deb [arch=amd64,i386 signed-by=/usr/share/keyrings/intel-graphics.gpg] https://repositories.intel.com/gpu/ubuntu noble unified" | sudo tee /etc/apt/sources.list.d/intel-gpu-noble.list

# 2. Install drivers, runtimes, and discovery tools
sudo apt update
sudo apt install -y libze-intel-gpu1 libze1 intel-opencl-icd clinfo intel-media-va-driver-non-free

# 3. Verify hardware
clinfo | grep "Device Name"
ls -l /dev/dri   # expect card0 and renderD128
```

## 2. K3s Control Plane (Head Node)

On the node acting as Slurm controller and NFS server:

```bash
# Install K3s server (disable Traefik to save resources for Slurm)
curl -sfL https://get.k3s.io | sh -s - server --disable traefik

# Capture the join token for workers
sudo cat /var/lib/rancher/k3s/server/node-token
```

## 3. K3s Agents (Worker Nodes)

Run the Slurm/NFS worker provisioning **first**, then join K3s:

```bash
curl -sfL https://get.k3s.io | K3S_URL=https://<CLUSTER_HN_IP>:6443 \
K3S_TOKEN=<YOUR_TOKEN> sh -
```

## 4. Intel GPU Integration For Kubernetes

Fixes the `ImagePullBackOff` / "version too low" issues seen with the device
plugin.

**A. Deploy the operator:**

```bash
kubectl apply -f https://raw.githubusercontent.com/intel/intel-device-plugins-for-kubernetes/main/deployments/operator/samples/deviceplugin.intel.com_gpudeviceplugins.yaml
```

**B. Configure the GPU plugin** (`intel-gpu-plugin.yaml`). The image tag must
be exactly `0.35.0` — no `v` prefix — to satisfy both the admission webhook
(>= 0.35.0) and Docker Hub:

```yaml
apiVersion: deviceplugin.intel.com/v1
kind: GpuDevicePlugin
metadata:
  name: gpu-plugin
  namespace: intel-device-plugins
spec:
  image: intel/intel-gpu-plugin:0.35.0
  sharedDevNum: 1
```

```bash
kubectl apply -f intel-gpu-plugin.yaml
```

## 5. Resource Partitioning Between The Two Orchestrators ("Double Boss" Fix)

Reserve system/Slurm resources so K3s cannot take RAM that Slurm needs (or
vice versa). On workers, edit `/etc/systemd/system/k3s-agent.service.env`:

```text
# Reserve 2 CPUs and 2GB RAM for Slurm/OS
K3S_AGENT_ARGS='--kubelet-arg="system-reserved=cpu=2,memory=2Gi"'
```

```bash
sudo systemctl daemon-reload && sudo systemctl restart k3s-agent
```

## 6. Verification Checklist

| Layer | Command | Expected Result |
| :--- | :--- | :--- |
| Hardware | `clinfo` | Intel(R) UHD Graphics 770 |
| K8s pods | `kubectl get pods -n intel-device-plugins` | `Running` (not ImagePullBackOff) |
| K8s GPU | `kubectl describe node <name> \| grep gpu` | `gpu.intel.com/i915: 1` |
| Slurm | `sinfo` | All nodes `idle` or `alloc` |

Once the GPU is recognized by K3s, workloads can request it with
`resources.limits: gpu.intel.com/i915: 1`.
