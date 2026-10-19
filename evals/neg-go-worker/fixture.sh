#!/bin/bash
set -e
mkdir -p "$(dirname 'go.mod')"
cat > 'go.mod' <<'__EOF__'
module example.com/hooks

go 1.22
__EOF__
mkdir -p "$(dirname 'main.go')"
cat > 'main.go' <<'__EOF__'
package main

import "net/http"

func main() { http.ListenAndServe(":8080", nil) }
__EOF__
