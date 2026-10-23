#!/bin/bash
# Refresh the gold snapshot branch. One commit, amended and force-pushed, so
# frequent updates never grow history.
set -euo pipefail
cd /home/ubuntu/egern-widgets
GOLD_OUT=/home/ubuntu/egern-widgets/data-repo/gold.json python3 fetch_gold.py >/dev/null
cd data-repo
git add gold.json
git -c user.email=hermes@local -c user.name=hermes commit -q --amend -m "gold snapshot"
git push -q -f origin HEAD:data
