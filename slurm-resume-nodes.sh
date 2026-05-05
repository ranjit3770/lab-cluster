#!/bin/bash

# Add Slurm's custom path to the existing PATH
export PATH=$PATH:/usr/local/slurm/bin

# 1. Get a list of all nodes currently in 'down' state
# Now sinfo and scontrol will be found automatically
DOWN_NODES=$(sinfo -h -t down -o %N)

if [ -z "$DOWN_NODES" ]; then
    echo "$(date): No nodes are currently DOWN. System healthy."
    exit 0
fi

echo "$(date): Found DOWN nodes: $DOWN_NODES"

for NODE in $(echo $DOWN_NODES | tr "," "\n"); do
    NODE_IP=$(scontrol show node $NODE | grep "NodeAddr=" | cut -d'=' -f2 | awk '{print $1}')
    
    echo "Checking $NODE at IP $NODE_IP..."

    if nc -zv -w 2 $NODE_IP 22 > /dev/null 2>&1; then
        OS_CHECK=$(ssh -o ConnectTimeout=2 -o StrictHostKeyChecking=no root@$NODE_IP "uname" 2>/dev/null)
        
        if [ "$OS_CHECK" == "Linux" ]; then
            echo "MATCH: $NODE is back in Linux. Resuming..."
            scontrol update nodename=$NODE state=RESUME
        else
            echo "SKIP: $NODE is online but likely still in Windows."
        fi
    else
        echo "OFFLINE: $NODE is still shutting down or rebooting."
    fi
done
