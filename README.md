# Ray Cluster Setup Documentation

## Overview

This document describes how to set up a Ray cluster, including:

* System preparation
* Python environment setup
* Ray installation
* Head node configuration
* Worker node configuration (with automatic IP detection)

---

## Header Setup / System Update

```bash
apt update && apt upgrade -y
```

---

## Install Dependencies

```bash
apt install python3-venv python3-pip python3 git curl vim wget
```

---

## Create and Activate Python Virtual Environment

```bash
python3 -m venv /opt/rayenv
source /opt/rayenv/bin/activate
```

---

## Install Ray (Common for Head & Worker Nodes)

```bash
pip install -U "ray[all]"

pip uninstall -y click pydantic pydantic-core typing-extensions

pip install \
  click==8.1.7 \
  pydantic==1.10.13 \
  typing-extensions==4.9.0
```

---

# Ray Head Node Setup

## Create Temp Directory

```bash
mkdir -p /mnt/ray_tmp
chmod 777 /mnt/ray_tmp
```

## Start Ray Head Node

```bash
ray start \
  --head \
  --node-ip-address=192.168.196.250 \
  --port=6379 \
  --dashboard-host=0.0.0.0 \
  --dashboard-port=8265 \
  --num-cpus=8 \
  --memory=17179869184 \
  --resources='{"node:ray-head": 1}' \
  --metrics-export-port=8080 \
  --ray-client-server-port=10001 \
  --temp-dir=/mnt/ray_tmp
```

---

# Ray Worker Node Setup

## Install Ray (same as head)

```bash
pip install -U "ray[all]"

pip uninstall -y click pydantic pydantic-core typing-extensions

pip install \
  click==8.1.7 \
  pydantic==1.10.13 \
  typing-extensions==4.9.0
```

---

## Create Temp Directory

```bash
mkdir -p /var/tmp/ray_tmp
chmod 777 /var/tmp/ray_tmp
```

---

## Get Worker Node IP Automatically

Use one of the following commands to detect the node’s primary IP address:

### Option 1 (recommended – most reliable)

```bash
NODE_IP=$(ip route get 1 | awk '{print $7; exit}')
```

### Option 2

```bash
NODE_IP=$(hostname -I | awk '{print $1}')
```

Verify:

```bash
echo $NODE_IP
```

---

## Start Ray Worker Node

```bash
ray start \
  --address=192.168.196.250:6379 \
  --node-ip-address=$NODE_IP \
  --num-cpus=12 \
  --memory=8589934592 \
  --temp-dir=/var/tmp/ray_tmp
```

---

## Notes

* Ensure all nodes can reach the head node on port **6379**
* Dashboard available at:

  ```
  http://<HEAD_NODE_IP>:8265
  ```
* Ray Client port: `10001`
* Metrics exposed on: `8080`
* Use the same Python and Ray versions on all nodes
* Virtual environment must be activated before running Ray

---
