#!/bin/sh

set -eu

if ! command -v node >/dev/null 2>&1; then
  echo "djournal requires Node 18 or newer" >&2
  exit 1
fi

major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$major" -lt 18 ]; then
  echo "djournal requires Node 18 or newer" >&2
  exit 1
fi

if [ -n "${JOURNAL_SOURCE_DIR:-}" ]; then
  source_dir=$JOURNAL_SOURCE_DIR
else
  source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
fi

if [ ! -f "$source_dir/bin/journal.js" ]; then
  echo "djournal source not found; set JOURNAL_SOURCE_DIR to an unpacked release or source checkout" >&2
  exit 1
fi

command=install
case "${1:-}" in
  install|upgrade|uninstall|status|doctor)
    command=$1
    shift
    ;;
esac

exec node "$source_dir/bin/journal.js" "$command" "$@"
