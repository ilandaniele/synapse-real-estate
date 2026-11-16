#!/usr/bin/env bash
# Retries launching the Always Free Ampere A1 VM until Oracle has capacity.
# Requires an authenticated OCI CLI (oci setup bootstrap). See docs/DEPLOYMENT.md.
set -euo pipefail
export PYTHONWARNINGS=ignore

NAME="${NAME:-synapse-showroom}"
OCPUS="${OCPUS:-4}"
MEMORY_GB="${MEMORY_GB:-24}"
SUBNET_NAME="${SUBNET_NAME:-synapse-public-subnet}"
SSH_KEY_FILE="${SSH_KEY_FILE:-$HOME/.ssh/id_ed25519_synapse_oracle.pub}"
RETRY_SECONDS="${RETRY_SECONDS:-90}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-0}"
OCI_CONFIG="${OCI_CONFIG:-$HOME/.oci/config}"
SHAPE="VM.Standard.A1.Flex"
RETRYABLE='Out of host capacity|Out of capacity|TooManyRequests|"status": 429'

log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

tenancy_from_config() {
  [ -f "$OCI_CONFIG" ] || fail "OCI CLI not configured ($OCI_CONFIG missing). Run: oci setup bootstrap"
  sed -n 's/^tenancy *= *//p' "$OCI_CONFIG" | head -n 1 | tr -d '\r'
}

query() { oci "$@" --all --raw-output | tr -d '\r'; }

existing_instance() {
  query compute instance list --compartment-id "$COMPARTMENT_ID" --display-name "$NAME" \
    --query "data[?\"lifecycle-state\"!='TERMINATED'] | [0].id"
}

subnet_id() {
  query network subnet list --compartment-id "$COMPARTMENT_ID" --display-name "$SUBNET_NAME" \
    --query "data[?\"lifecycle-state\"=='AVAILABLE'] | [0].id"
}

availability_domain() {
  oci iam availability-domain list --compartment-id "$COMPARTMENT_ID" \
    --query 'data[0].name' --raw-output | tr -d '\r'
}

ubuntu_image() {
  oci compute image list --compartment-id "$COMPARTMENT_ID" --operating-system "Canonical Ubuntu" \
    --operating-system-version "24.04" --shape "$SHAPE" --sort-by TIMECREATED --sort-order DESC \
    --limit 1 --query 'data[0].id' --raw-output | tr -d '\r'
}

public_ip() {
  oci compute instance list-vnics --instance-id "$1" --query 'data[0]."public-ip"' --raw-output | tr -d '\r'
}

launch() {
  oci compute instance launch \
    --compartment-id "$COMPARTMENT_ID" \
    --availability-domain "$AD" \
    --display-name "$NAME" \
    --shape "$SHAPE" \
    --shape-config "{\"ocpus\": $OCPUS, \"memoryInGBs\": $MEMORY_GB}" \
    --image-id "$IMAGE_ID" \
    --subnet-id "$SUBNET_ID" \
    --assign-public-ip true \
    --metadata "{\"ssh_authorized_keys\": \"$SSH_KEY\"}" \
    --wait-for-state RUNNING \
    --query 'data.id' --raw-output
}

COMPARTMENT_ID="${COMPARTMENT_ID:-$(tenancy_from_config)}"
[ -n "$COMPARTMENT_ID" ] || fail "No compartment id. Set COMPARTMENT_ID or fix $OCI_CONFIG"
[ -f "$SSH_KEY_FILE" ] || fail "SSH public key not found: $SSH_KEY_FILE"
SSH_KEY="$(tr -d '\r\n' < "$SSH_KEY_FILE")"

found="$(existing_instance)"
if [ -n "$found" ] && [ "$found" != "null" ]; then
  fail "Instance '$NAME' already exists ($found). Not launching a second one."
fi

SUBNET_ID="$(subnet_id)"
[ -n "$SUBNET_ID" ] && [ "$SUBNET_ID" != "null" ] \
  || fail "Subnet '$SUBNET_NAME' not found. Create the VCN with a public subnet in the console first."
AD="$(availability_domain)"
IMAGE_ID="$(ubuntu_image)"
[ -n "$IMAGE_ID" ] && [ "$IMAGE_ID" != "null" ] || fail "No Ubuntu 24.04 image for $SHAPE"

log "Launching $NAME ($SHAPE, $OCPUS OCPU, $MEMORY_GB GB) in $AD, retry every ${RETRY_SECONDS}s"
[ "${DRY_RUN:-0}" = "1" ] && { log "DRY_RUN=1: checks passed, not launching."; exit 0; }

attempt=0
while :; do
  attempt=$((attempt + 1))
  if output="$(launch 2>&1)"; then
    instance_id="$(printf '%s' "$output" | tail -n 1 | tr -d '\r')"
    log "RUNNING after $attempt attempt(s): $instance_id"
    log "Public IP: $(public_ip "$instance_id")"
    exit 0
  fi
  printf '%s' "$output" | grep -Eq "$RETRYABLE" || { printf '%s\n' "$output" >&2; fail "Non-retryable error"; }
  if [ "$MAX_ATTEMPTS" -gt 0 ] && [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
    fail "No capacity after $attempt attempts"
  fi
  log "Attempt $attempt: no capacity. Next try in ${RETRY_SECONDS}s"
  sleep "$RETRY_SECONDS"
done
