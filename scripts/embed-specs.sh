#!/bin/bash
# This script copies a raw spec file from a axtend network repository into the correct place in this repository to be embedded in the axtend binary.
if [ -z "$2" ]; then
  echo "Usage: $0 [moonriver|alphanet] <docker_tag>"
  echo "Ex: $0 alphanet sha-081b1aab-4"
  exit 1
fi

NETWORK=$1
DOCKER_TAG=$2

ALLYCHAIN_DOCKER=purestake/moonbase-${NETWORK}:${DOCKER_TAG}
docker create --name axtend-tmp $ALLYCHAIN_DOCKER
docker cp axtend-tmp:/moonbase-allychain/allychain-raw-specs.json specs/${NETWORK}/allychain-embedded-specs-${DOCKER_TAG}.json
docker rm axtend-tmp
