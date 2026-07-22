#!/usr/bin/env bash
set -euo pipefail

SKILL_NAME="controls-doctrine-operator"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$SCRIPT_DIR"

CODEX_HOME="${CODEX_HOME:-"$HOME/.codex"}"
CODEX_SKILLS_DIR="${CODEX_SKILLS_DIR:-"$CODEX_HOME/skills"}"
CLAUDE_HOME="${CLAUDE_HOME:-"$HOME/.claude"}"
CLAUDE_SKILLS_DIR="${CLAUDE_SKILLS_DIR:-"$CLAUDE_HOME/skills"}"

CODEX_SOURCE="$REPO_ROOT/codex-skills/$SKILL_NAME"
CLAUDE_SOURCE="$REPO_ROOT/.claude/skills/$SKILL_NAME"
CODEX_DEST="$CODEX_SKILLS_DIR/$SKILL_NAME"
CLAUDE_DEST="$CLAUDE_SKILLS_DIR/$SKILL_NAME"

DRY_RUN=0
FORCE=0
COPY_MODE=0

usage() {
  cat <<EOF
Usage: ./install-ai-cli-skills.sh [--dry-run] [--force] [--copy]

Installs the Controls Doctrine Operator skill into:
  Codex CLI:       \$CODEX_HOME/skills/$SKILL_NAME
  Claude Code CLI: \$CLAUDE_HOME/skills/$SKILL_NAME

Options:
  --dry-run  Print planned actions without changing files.
  --force    Replace an existing non-matching destination.
  --copy     Copy skill folders instead of symlinking.
EOF
}

log() {
  printf '%s\n' "$*"
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '[dry-run] %q' "$1"
    shift
    for arg in "$@"; do
      printf ' %q' "$arg"
    done
    printf '\n'
  else
    "$@"
  fi
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --dry-run)
        DRY_RUN=1
        ;;
      --force)
        FORCE=1
        ;;
      --copy)
        COPY_MODE=1
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "Unknown argument: $1"
        ;;
    esac
    shift
  done
}

ensure_source() {
  local source_dir="$1"
  local label="$2"

  [ -d "$source_dir" ] || die "$label source folder not found: $source_dir"
  [ -f "$source_dir/SKILL.md" ] || die "$label SKILL.md not found: $source_dir/SKILL.md"
}

warn_cli_missing() {
  local command_name="$1"
  local label="$2"

  if command -v "$command_name" >/dev/null 2>&1; then
    log "$label CLI: $(command -v "$command_name")"
    "$command_name" --version 2>/dev/null || true
  else
    log "WARN: $label CLI not found in PATH. Installing the skill folder anyway."
  fi
}

same_symlink_target() {
  local dest="$1"
  local source="$2"

  [ -L "$dest" ] || return 1
  [ "$(readlink "$dest")" = "$source" ]
}

install_skill() {
  local source="$1"
  local skills_dir="$2"
  local dest="$3"
  local label="$4"

  log ""
  log "$label skills dir: $skills_dir"
  run mkdir -p "$skills_dir"

  if [ -e "$dest" ] || [ -L "$dest" ]; then
    if [ "$COPY_MODE" -eq 0 ] && same_symlink_target "$dest" "$source"; then
      log "$label already installed: $dest -> $source"
      return
    fi

    if [ "$FORCE" -ne 1 ]; then
      die "$label destination already exists and does not match: $dest (rerun with --force to replace)"
    fi

    run rm -rf "$dest"
  fi

  if [ "$COPY_MODE" -eq 1 ]; then
    run cp -R "$source" "$dest"
    if [ "$DRY_RUN" -eq 1 ]; then
      log "$label would install by copy: $dest"
      log "$label would record runtime root: $REPO_ROOT"
    else
      printf '%s\n' "$REPO_ROOT" > "$dest/.cannae-os-root"
      log "$label installed by copy: $dest"
    fi
  else
    run ln -s "$source" "$dest"
    if [ "$DRY_RUN" -eq 1 ]; then
      log "$label would install by symlink: $dest -> $source"
    else
      log "$label installed by symlink: $dest -> $source"
    fi
  fi
}

validate_router_coverage() {
  if command -v node >/dev/null 2>&1; then
    log ""
    log "Validating route coverage..."
    run node "$REPO_ROOT/codex-skills/$SKILL_NAME/scripts/route_controls_docs.js" --coverage "$REPO_ROOT"
  else
    log "WARN: node not found in PATH; skipping route coverage validation."
  fi
}

main() {
  parse_args "$@"

  log "Repo root: $REPO_ROOT"
  ensure_source "$CODEX_SOURCE" "Codex"
  ensure_source "$CLAUDE_SOURCE" "Claude Code"

  warn_cli_missing codex "Codex"
  warn_cli_missing claude "Claude Code"

  install_skill "$CODEX_SOURCE" "$CODEX_SKILLS_DIR" "$CODEX_DEST" "Codex"
  install_skill "$CLAUDE_SOURCE" "$CLAUDE_SKILLS_DIR" "$CLAUDE_DEST" "Claude Code"
  validate_router_coverage
}

main "$@"
