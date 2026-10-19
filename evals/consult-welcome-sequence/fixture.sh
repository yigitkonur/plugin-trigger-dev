#!/bin/bash
set -e
mkdir -p "$(dirname 'package.json')"
cat > 'package.json' <<'__EOF__'
{
  "name": "shop",
  "private": true,
  "dependencies": {
    "next": "16.0.0",
    "react": "19.0.0",
    "react-dom": "19.0.0"
  }
}
__EOF__
mkdir -p "$(dirname 'app/page.tsx')"
cat > 'app/page.tsx' <<'__EOF__'
export default function Page() { return <main>shop</main>; }
__EOF__
touch pnpm-lock.yaml
