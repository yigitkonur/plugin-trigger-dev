#!/bin/bash
set -e
mkdir -p "$(dirname 'scripts/cleanup.sh')"
cat > 'scripts/cleanup.sh' <<'__EOF__'
#!/bin/sh
echo cleaning
__EOF__
mkdir -p "$(dirname '.github/workflows/ci.yml')"
cat > '.github/workflows/ci.yml' <<'__EOF__'
name: ci
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo ok
__EOF__
mkdir -p "$(dirname 'README.md')"
cat > 'README.md' <<'__EOF__'
# infra scripts
__EOF__
