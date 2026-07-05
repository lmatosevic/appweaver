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

elif [ "$role" = "migrations" ]; then
  echo "Executing migrations..."
  npx weaver migrate

elif [ "$role" = "seed" ]; then
  echo "Seeding database..."
  npx weaver seed

else
  echo "Could not match the container role \"$role\""
  exit 1
fi
