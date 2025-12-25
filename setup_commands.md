```bash
ray stop --force || true
pkill -9 -f ray || true
pkill -9 -f gcs || true
pkill -9 -f redis || true
pkill -9 -f plasma || true
rm -rf /tmp/ray
rm -rf /tmp/ray_session*
rm -rf /tmp/ray_spill*
```
```bash
pip install "ray['all']"
```
```bash
pip uninstall -y click pydantic pydantic-core typing-extensions
pip install \
  click==8.1.7 \
  pydantic==1.10.13 \
  typing-extensions==4.9.0
```
```bash
ray start \
  --head \
  --node-ip-address=192.168.196.250 \
  --port=6379 \
  --dashboard-host=0.0.0.0 \
  --dashboard-port=8265 \
  --num-cpus=8 \
  --memory=17179869184 \
  --resources='{"node:ray-head": 1}'
```

```bash
ray stop --force
rm -rf /tmp/ray
```

```bash
ray start \
  --address=192.168.196.250:6379 \
  --node-ip-address=192.168.196.90 \
  --num-cpus=12 \
  --memory=8589934592 \
  --object-store-memory=6442450944 \
  --resources='{"node:worker-node1": 1}'
```

```bash
ray start \
  --address=192.168.196.250:6379 \
  --node-ip-address=192.168.196.91 \
  --num-cpus=12 \
  --memory=8589934592 \
  --resources='{"node:worker-node2": 1}'
```
```bash
ray start \
  --address=192.168.196.250:6379 \
  --node-ip-address=192.168.196.92 \
  --num-cpus=12 \
  --memory=8589934592 \
  --resources='{"node:worker-node3": 1}'
  ```
