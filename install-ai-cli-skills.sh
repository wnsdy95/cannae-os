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

Requires Node.js. Both destinations are checked before installation.
Copies retain a doctrine-root marker; they are not a standalone corpus.
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
    run "$command_name" --version 2>/dev/null || true
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

preflight_destinations() {
  command -v node >/dev/null 2>&1 || die "Node.js is required for routing and installation checks."
  node - "$CODEX_SOURCE" "$CLAUDE_SOURCE" "$CODEX_DEST" "$CLAUDE_DEST" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const [codexSource, claudeSource, codexDest, claudeDest] = process.argv.slice(2);
function physicalParent(directory) {
  const suffix = [];
  let current = path.resolve(directory);
  while (true) {
    try { fs.lstatSync(current); break; }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      suffix.unshift(path.basename(current));
      current = path.dirname(current);
    }
  }
  const physical = fs.realpathSync(current);
  if (!fs.statSync(physical).isDirectory()) {
    throw new Error("Installation parent is not a directory.");
  }
  return path.join(physical, ...suffix);
}
function entryLocation(file) {
  return path.join(physicalParent(path.dirname(file)), path.basename(file));
}
const contains = (a, b) => a === b || a.startsWith(b + path.sep);
const overlaps = (a, b) => contains(a, b) || contains(b, a);
try {
  const sources = [codexSource, claudeSource].map(file => fs.realpathSync(file));
  const destinations = [codexDest, claudeDest].map(entryLocation);
  if (destinations.some(dest => sources.some(source => overlaps(dest, source))) ||
      overlaps(...destinations)) {
    throw new Error("Installation paths overlap a source tree or another client destination.");
  }
} catch (error) {
  console.error("ERROR: " + error.message);
  process.exit(1);
}
NODE
  check_destination "$CODEX_SOURCE" "$CODEX_DEST" "Codex"
  check_destination "$CLAUDE_SOURCE" "$CLAUDE_DEST" "Claude Code"
}

check_destination() {
  local source="$1" dest="$2" label="$3"
  if [ -e "$dest" ] || [ -L "$dest" ]; then
    if [ "$COPY_MODE" -eq 0 ] && same_symlink_target "$dest" "$source"; then return; fi
    [ "$FORCE" -eq 1 ] || die "$label destination already exists and does not match: $dest (rerun with --force to replace)"
  fi
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

  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    log "[dry-run] $label would stage and install: $dest (copy=$COPY_MODE)"
    return
  fi

  local staging
  staging="$(mktemp -d "$skills_dir/.controls-install.XXXXXX")"
  if [ "$COPY_MODE" -eq 1 ]; then
    if ! cp -R "$source" "$staging/$SKILL_NAME"; then
      rm -rf "$staging"
      die "$label copy failed; destination was not replaced."
    fi
    if ! printf '%s\n' "$REPO_ROOT" > "$staging/$SKILL_NAME/.cannae-os-root"; then
      rm -rf "$staging"
      die "$label marker creation failed; destination was not replaced."
    fi
  elif ! ln -s "$source" "$staging/$SKILL_NAME"; then
    rm -rf "$staging"
    die "$label link creation failed; destination was not replaced."
  fi
  if [ -e "$dest" ] || [ -L "$dest" ]; then
    if [ "$FORCE" -ne 1 ]; then
      rm -rf "$staging"
      die "$label destination appeared during staging; no replacement was performed."
    fi
    mv "$dest" "$staging/previous"
  fi
  if ! mv "$staging/$SKILL_NAME" "$dest"; then
    if [ -e "$staging/previous" ] || [ -L "$staging/previous" ]; then
      mv "$staging/previous" "$dest" || die "$label restore failed; preserve $staging for recovery."
    fi
    rm -rf "$staging"
    die "$label installation failed."
  fi
  rm -rf "$staging"
  log "$label installed: $dest (copy=$COPY_MODE)"
}

validate_router_coverage() {
  log ""
  log "Validating both skill bundles and route coverage..."
  run node "$REPO_ROOT/validate-controls-skill.js" "codex-skills/$SKILL_NAME"
  run node "$REPO_ROOT/validate-controls-skill.js" ".claude/skills/$SKILL_NAME"
  run node "$CODEX_SOURCE/scripts/route_controls_docs.js" --coverage "$REPO_ROOT"
  run node "$CLAUDE_SOURCE/scripts/route_controls_docs.js" --coverage "$REPO_ROOT"
}

main() {
  parse_args "$@"

  log "Repo root: $REPO_ROOT"
  ensure_source "$CODEX_SOURCE" "Codex"
  ensure_source "$CLAUDE_SOURCE" "Claude Code"
  preflight_destinations
  validate_router_coverage

  warn_cli_missing codex "Codex"
  warn_cli_missing claude "Claude Code"

  install_skill "$CODEX_SOURCE" "$CODEX_SKILLS_DIR" "$CODEX_DEST" "Codex"
  install_skill "$CLAUDE_SOURCE" "$CLAUDE_SKILLS_DIR" "$CLAUDE_DEST" "Claude Code"
}

main "$@"
