#!/bin/sh

set -e

if [ "$1" ]; then
  role="$1"
else
  role="app"
fi

if [ "$role" = "app" ]; then
  echo "Starting application..."
  npm run start

elif [ "$role" = "migrations" ]; then
  echo "Executing migrations..."
  npm run migrate

else
  echo "Could not match the container role \"$role\""
  exit 1
fi
