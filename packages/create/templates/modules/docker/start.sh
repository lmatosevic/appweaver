#!/bin/sh

set -e

if [ "$1" ]; then
  role="$1"
else
  role="app"
fi

if [ "$role" = "app" ]; then
  echo "Starting application..."
  npx weaver start

else
  echo "Could not match the container role \"$role\""
  exit 1
fi
