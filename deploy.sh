#!/bin/bash

WITH_SEED=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --with-seed)
      WITH_SEED=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

export INFISICAL_TOKEN_SERVICE=$(infisical login --method=universal-auth --client-id=$INFISICAL_MACHINE_CLIENT_ID --client-secret=$INFISICAL_MACHINE_CLIENT_SECRET --silent --plain)

if [ "$WITH_SEED" = "true" ]; then
  export RUN_SEED_AND_MIGRATE=true
fi

docker compose up -d --build --remove-orphans