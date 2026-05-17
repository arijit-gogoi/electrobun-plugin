#!/usr/bin/env bash
# Bootstrap electrobun upstream clone for skill build-reference.
# Idempotent. Usage:
#   ./scripts/bootstrap.sh             # clone if missing, skip otherwise
#   ./scripts/bootstrap.sh --refresh   # git pull existing clone
#   ./scripts/bootstrap.sh --force     # nuke + reclone
set -euo pipefail

REFRESH=0
FORCE=0
for arg in "$@"; do
    case "$arg" in
        --refresh) REFRESH=1 ;;
        --force)   FORCE=1 ;;
        *) echo "Unknown arg: $arg" >&2; exit 2 ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
CACHE_DIR="$REPO_ROOT/.cache"
CLONE_DIR="$CACHE_DIR/electrobun"
UPSTREAM="https://github.com/blackboardsh/electrobun.git"

if [[ $FORCE -eq 1 && -d "$CLONE_DIR" ]]; then
    echo "Force: removing $CLONE_DIR"
    rm -rf "$CLONE_DIR"
fi

mkdir -p "$CACHE_DIR"

if [[ -d "$CLONE_DIR" ]]; then
    if [[ $REFRESH -eq 1 ]]; then
        echo "Refresh: pulling $CLONE_DIR"
        git -C "$CLONE_DIR" pull --ff-only
    else
        echo "Clone exists at $CLONE_DIR (use --refresh to pull, --force to reclone)"
    fi
else
    echo "Cloning $UPSTREAM -> $CLONE_DIR (shallow)"
    git clone --depth 1 "$UPSTREAM" "$CLONE_DIR"
fi

SHA="$(git -C "$CLONE_DIR" rev-parse HEAD)"
echo "electrobun HEAD: $SHA"
