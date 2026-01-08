#!/bin/bash
# Change to the directory where this script is located
cd "$(dirname "$0")"
exec node mcp-server.js
