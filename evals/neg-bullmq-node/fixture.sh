#!/bin/bash
set -e
mkdir -p "$(dirname 'package.json')"
cat > 'package.json' <<'__EOF__'
{
  "name": "queue-app",
  "private": true,
  "dependencies": {
    "express": "4.21.0",
    "bullmq": "5.12.0",
    "ioredis": "5.4.1"
  }
}
__EOF__
mkdir -p "$(dirname 'src/server.js')"
cat > 'src/server.js' <<'__EOF__'
const express = require('express');
const app = express();
app.listen(3000);
__EOF__
