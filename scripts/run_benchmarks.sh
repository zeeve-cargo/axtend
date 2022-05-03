#!/bin/bash

# This script is an example for running Axtend's benchmarks.
# It requires Axtend to be compiled with --features=runtime-benchmarks

export WASMTIME_BACKTRACE_DETAILS=1

./target/release/axtend benchmark \
    --chain dev \
    --execution=wasm \
    --wasm-execution=compiled \
    --pallet "allychain_staking" \
    --extrinsic "*" \
    --steps 32 \
    --repeat 64 \
    --raw \
    --template=./benchmarking/frame-weight-template.hbs \
    --output /tmp/ \
    --record-proof
