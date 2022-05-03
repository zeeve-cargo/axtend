#!/bin/bash

LOCAL_GIT_BRANCH="$(git symbolic-ref HEAD 2>/dev/null)"
LOCAL_GIT_BRANCH=${LOCAL_GIT_BRANCH##refs/heads/}

echo ${1:-"$LOCAL_GIT_BRANCH"}

rm -rf build/{axtend-runtime-overrides,wasm}
mkdir -p build/wasm
git clone --depth 1 -b master-without-wasm https://github.com/PureStake/axtend-runtime-overrides build/axtend-runtime-overrides

cd build/axtend-runtime-overrides
./scripts/import-tracing-runtime.sh local ${1:-"$LOCAL_GIT_BRANCH"}
cd tracing/local && cargo update -p evm && cd ../..
./scripts/build-tracing-runtime.sh local moonbase
mv wasm/moonbase-runtime-local-substitute-tracing.wasm ../wasm/moonbase-runtime-local-substitute-tracing.wasm
