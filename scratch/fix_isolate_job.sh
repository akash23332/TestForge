#!/usr/bin/env bash
set -euo pipefail

fix_file() {
  local container="$1"
  docker compose -f /home/azureuser/deploy-judge0/docker-compose.yml exec -u root "$container" python3 -c '
with open("/api/app/jobs/isolate_job.rb", "r") as f:
    lines = f.readlines()
if "open3" in lines[0]:
    lines[0] = "require '\''open3'\''\n"
else:
    lines.insert(0, "require '\''open3'\''\n")
with open("/api/app/jobs/isolate_job.rb", "w") as f:
    f.writelines(lines)
'
}

fix_file judge0-server
fix_file judge0-workers
echo "Fixed isolate_job.rb in server and workers"
