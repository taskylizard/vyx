#!/bin/bash

WITH_SEED=false
WITH_MIGRATE=false

while [[ $# -gt 0 ]]; do
   case $1 in
     --seed)
       WITH_SEED=true
       shift
       ;;
     --migrate)
       WITH_MIGRATE=true
       shift
       ;;
     *)
       echo "Unknown option: $1"
       exit 1
       ;;
   esac
done

export INFISICAL_TOKEN_SERVICE=$(infisical login --method=universal-auth --client-id=$INFISICAL_MACHINE_CLIENT_ID --client-secret=$INFISICAL_MACHINE_CLIENT_SECRET --silent --plain)

if [ "$WITH_MIGRATE" = "true" ]; then
   export RUN_MIGRATE=true
fi

if [ "$WITH_SEED" = "true" ]; then
   export RUN_SEED=true
fi

docker compose up -d --build --remove-orphans