#!/bin/bash
# Generates the runtime wasm for moonbase, moonriver and axtend
set -e
source scripts/_init_var.sh

for runtime in moonbase moonriver axtend; do
  echo "=================== $runtime ==================="
  RUNTIME_BUILD_FOLDER=$BUILD_FOLDER/runtimes
  mkdir -p $RUNTIME_BUILD_FOLDER
  RUNTIME_WASM="$RUNTIME_BUILD_FOLDER/${runtime}-runtime.wasm"

  $AXTEND_BINARY export-genesis-wasm \
    --chain "${runtime}-local" \
    > $RUNTIME_WASM;
  echo $RUNTIME_WASM generated
done