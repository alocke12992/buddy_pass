#!/usr/bin/env bash
# The single deploy entrypoint (INFRA.md §3), run via SSM by CI or by hand:
#   /opt/buddy-pass/deploy.sh <image-tag>
# Renders .env from SSM, pulls images, migrates, restarts, health-checks, prunes.
set -euo pipefail

IMAGE_TAG="$${1:?usage: deploy.sh <image-tag>}"
cd /opt/buddy-pass

echo "==> logging in to ECR"
aws ecr get-login-password --region ${region} |
  docker login --username AWS --password-stdin ${ecr_registry}

echo "==> rendering .env from SSM (/${name_prefix}/env/)"
umask 077
aws ssm get-parameters-by-path \
  --path "/${name_prefix}/env/" --with-decryption --region ${region} \
  --query 'Parameters[].{k:Name,v:Value}' --output json |
  jq -r '.[] | (.k | split("/") | last) + "=" + .v' > .env
echo "IMAGE_TAG=$${IMAGE_TAG}" >> .env

echo "==> pulling images ($${IMAGE_TAG})"
docker compose -f docker-compose.prod.yml pull

echo "==> running migrations"
docker compose -f docker-compose.prod.yml run --rm api node dist/migrate.js

echo "==> starting services"
docker compose -f docker-compose.prod.yml up -d

echo "==> health check"
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/health > /dev/null; then
    echo "healthy after $${i}s"
    docker image prune -af --filter "until=168h" > /dev/null
    echo "==> deploy of $${IMAGE_TAG} complete"
    exit 0
  fi
  sleep 1
done

echo "!! api failed health check after 30s" >&2
docker compose -f docker-compose.prod.yml logs --tail 50 api >&2
exit 1
