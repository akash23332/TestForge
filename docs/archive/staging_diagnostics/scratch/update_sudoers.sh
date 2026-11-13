#!/usr/bin/env bash
set -euo pipefail

docker compose -f /home/azureuser/deploy-judge0/docker-compose.yml exec -u root judge0-workers bash -c 'cat << "EOF" > /etc/sudoers.d/judge0
judge0 ALL=(ALL) NOPASSWD: /usr/local/bin/start-cron-daemon, /usr/local/bin/isolate-wrapper, /usr/sbin/service cron start, /etc/init.d/cron start, /bin/chown, /usr/bin/chown, /bin/rm, /usr/bin/rm, /bin/touch, /usr/bin/touch
EOF
chmod 0440 /etc/sudoers.d/judge0'

docker compose -f /home/azureuser/deploy-judge0/docker-compose.yml exec -u root judge0-server bash -c 'cat << "EOF" > /etc/sudoers.d/judge0
judge0 ALL=(ALL) NOPASSWD: /usr/local/bin/start-cron-daemon, /usr/local/bin/isolate-wrapper, /usr/sbin/service cron start, /etc/init.d/cron start, /bin/chown, /usr/bin/chown, /bin/rm, /usr/bin/rm, /bin/touch, /usr/bin/touch
EOF
chmod 0440 /etc/sudoers.d/judge0'

echo "Updated sudoers in server and workers"
