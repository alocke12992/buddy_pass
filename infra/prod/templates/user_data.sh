#!/usr/bin/env bash
# cloud-init user_data — runs ONCE at first boot (INFRA.md §3). The box is cattle:
# meaningful host-level changes = terraform taint + re-create + one deploy.
set -euxo pipefail

dnf install -y docker jq dnf-automatic

# container log rotation
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
JSON

systemctl enable --now docker

# docker compose v2 plugin (not packaged in AL2023)
ARCH=$(uname -m)
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/download/${compose_version}/docker-compose-linux-$${ARCH}" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# unattended OS security patches
sed -i 's/^apply_updates.*/apply_updates = yes/' /etc/dnf/automatic.conf
sed -i 's/^upgrade_type.*/upgrade_type = security/' /etc/dnf/automatic.conf
systemctl enable --now dnf-automatic.timer

# app directory
mkdir -p /opt/buddy-pass
# RDS CA bundle so postgres TLS is verified, not just encrypted
curl -fsSL https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
  -o /opt/buddy-pass/rds-ca.pem
cat > /opt/buddy-pass/docker-compose.prod.yml <<'COMPOSE'
${compose_file}
COMPOSE
cat > /opt/buddy-pass/deploy.sh <<'DEPLOY'
${deploy_script}
DEPLOY
chmod +x /opt/buddy-pass/deploy.sh
