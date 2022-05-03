./target/release/axtend build-spec --chain moonbase-local --disable-default-bootnode > ./res/plain.json

```
rm -rf ./res/*
./target/release/axtend build-spec --chain moonbase-local --raw --disable-default-bootnode > ./res/raw.json
./target/release/axtend export-genesis-wasm --chain ./res/raw.json > ./res/para-2000-wasm
./target/release/axtend export-genesis-state --chain ./res/raw.json > ./res/para-2000-genesis
```

./target/release/axtend \
--collator \
--force-authoring \
--chain ./res/raw.json \
--base-path ./data/one \
--port 30305 \
--ws-port 9905 \
--rpc-port 8805 \
-- \
--execution wasm \
--chain ./specs/raw.json \
--port 30306 \
--ws-port 9906 \
--rpc-port 8806
