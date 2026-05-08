#!/bin/bash

# Add Slurm's custom path
export PATH=$PATH:/usr/local/slurm/bin

# 1. Get the raw list (e.g., worker-node[24,28])
DOWN_NODES_RAW=$(sinfo -h -t down -o %N)

if [ -z "$DOWN_NODES_RAW" ]; then
    echo "$(date): No nodes are currently DOWN. System healthy."
    exit 0
fi

echo "$(date): Found DOWN nodes: $DOWN_NODES_RAW"

# 2. Expand the brackets into individual lines
NODE_LIST=$(scontrol show hostnames "$DOWN_NODES_RAW")

for NODE in $NODE_LIST; do
    # Get IP - note: scontrol show node $NODE works perfectly on individual names
    NODE_IP=$(scontrol show node "$NODE" | grep "NodeAddr=" | cut -d'=' -f2 | awk '{print $1}')
    
    echo "Checking $NODE at IP $NODE_IP..."

    if [ -z "$NODE_IP" ]; then
        echo "ERROR: Could not resolve IP for $NODE"
        continue
    fi

    if nc -zv -w 2 "$NODE_IP" 22 > /dev/null 2>&1; then
        OS_CHECK=$(ssh -o ConnectTimeout=2 -o StrictHostKeyChecking=no root@"$NODE_IP" "uname" 2>/dev/null)
        
        if [ "$OS_CHECK" == "Linux" ]; then
            echo "MATCH: $NODE is back in Linux. Resuming..."
            scontrol update nodename="$NODE" state=RESUME
        else
            echo "SKIP: $NODE is online but likely still in Windows."
        fi
    else
        echo "OFFLINE: $NODE is still shutting down or rebooting."
    fi
done
