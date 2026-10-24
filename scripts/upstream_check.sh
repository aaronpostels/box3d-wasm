#!/usr/bin/env bash
# Compares the vendored Box3D commit with the tip of upstream. Read-only: it never touches the submodule and never pushes.
#   scripts/upstream_check.sh              prints the two commits; exit 0 = vendored is current, 10 = upstream has moved, 2 = error
#   scripts/upstream_check.sh --selftest   offline check against throwaway local repos
# Env: UPSTREAM_URL (default: the url in .gitmodules), UPSTREAM_REF (default HEAD), VENDORED_SHA (default: the gitlink in the index).
# CI reads "changed=true|false" from $GITHUB_OUTPUT when it is set.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp=

# check <vendored sha> <upstream url> <ref>
check() {
  local vendored="$1" url="$2" ref="$3" upstream
  upstream=$(git ls-remote "$url" "$ref" | awk 'NR==1{print $1}')
  [ -n "$upstream" ] || { echo "upstream_check: no commit for '$ref' at $url" >&2; return 2; }
  echo "vendored: $vendored"
  echo "upstream: $upstream"
  if [ "$vendored" = "$upstream" ]; then
    echo "current"; [ -z "${GITHUB_OUTPUT:-}" ] || echo "changed=false" >> "$GITHUB_OUTPUT"; return 0
  fi
  echo "changed"; [ -z "${GITHUB_OUTPUT:-}" ] || echo "changed=true" >> "$GITHUB_OUTPUT"; return 10
}

selftest() {
  local rc a b out
  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
  git init -q "$tmp/up"
  git -C "$tmp/up" -c user.name=t -c user.email=t@t commit -q --allow-empty -m a
  a=$(git -C "$tmp/up" rev-parse HEAD)
  rc=0; check "$a" "$tmp/up" HEAD >/dev/null || rc=$?
  [ "$rc" = 0 ] || { echo "selftest: same commit should be current, got $rc" >&2; exit 1; }
  git -C "$tmp/up" -c user.name=t -c user.email=t@t commit -q --allow-empty -m b
  b=$(git -C "$tmp/up" rev-parse HEAD)
  rc=0; out=$(check "$a" "$tmp/up" HEAD) || rc=$?
  { [ "$rc" = 10 ] && echo "$out" | grep -q "upstream: $b"; } || { echo "selftest: moved upstream should exit 10, got $rc" >&2; exit 1; }
  rc=0; check "$a" "$tmp/up" refs/heads/nope >/dev/null 2>&1 || rc=$?
  [ "$rc" = 2 ] || { echo "selftest: unknown ref should exit 2, got $rc" >&2; exit 1; }
  echo "ok upstream_check selftest"
}

if [ "${1:-}" = "--selftest" ]; then selftest; exit 0; fi

url="${UPSTREAM_URL:-$(git -C "$repo" config -f .gitmodules --get submodule.vendor/box3d.url)}"
vendored="${VENDORED_SHA:-$(git -C "$repo" rev-parse :vendor/box3d)}"
check "$vendored" "$url" "${UPSTREAM_REF:-HEAD}"
