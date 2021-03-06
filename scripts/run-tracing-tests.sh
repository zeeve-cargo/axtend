#!/bin/bash

echo 'Make sure you have built axtend-types-bundle and run "npm install" in the test/ folder.'

BUILD_LAST_TRACING_RUNTIME="no"

if [ -e tests/moonbase-overrides/moonbase-runtime-local-substitute-tracing.wasm ]; then
  if [[ "$1" == "-f" ]]; then
    BUILD_LAST_TRACING_RUNTIME="yes"
  fi
else
  BUILD_LAST_TRACING_RUNTIME="yes"
fi

if [[ "$BUILD_LAST_TRACING_RUNTIME" == "yes" ]]; then
  ./scripts/build-last-tracing-runtime.sh
  mkdir -p tests/moonbase-overrides/
  mv build/wasm/moonbase-runtime-local-substitute-tracing.wasm tests/moonbase-overrides/
else
  echo "The tracing runtime is not rebuilt, if you want to rebuild it, use the option '-f'."
fi

echo "Run tracing tests…"
cd tests
ETHAPI_CMD="--ethapi=txpool,debug,trace" FORCE_WASM_EXECUTION="true" WASM_RUNTIME_OVERRIDES="moonbase-overrides" node_modules/.bin/mocha --parallel -j 2 -r ts-node/register 'tracing-tests/**/test-*.ts'
cd ..
