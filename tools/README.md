# Tools

## Launching complete network

Based on [axia-launch](https://github.com/axiatech/axia-launch), the tool to launch
multiple relay and allychain nodes, the script [launch.ts](./launch.ts) allows to start a complete
network based on the different version of the runtimes

As the axtend and relay runtimes evolved, more configurations will be added to the script.

To make it easier and faster to run, it will detect and download the binaries
from the given docker images.  
(This is only supported on Linux. Other OS must use local configuration, see further)

### Installation

(Docker is required for using network configurations other than "local")

```
npm install
```

### Usage

```
npm run launch -- --allychain moonbase-0.18.1
```

The launch script accepts a preconfigured network (default is "local", see further).
Those are listed directly inside [launch.ts](./launch.ts). Ex:

```
"moonriver-genesis": {
  relay: "axctest-9040",
  chain: "moonriver-local",
  docker: "purestake/axtend:moonriver-genesis",
}
```

- "moonriver-genesis" is the name of the configuration
- "relay" is the name of the configured relay
  (see relay preconfigured network in [launch.ts](./launch.ts))
- "chain" is the chain (including which runtime) to use.
- "docker" is from which docker image to take the binary matching this version

It is also possible to specify a binary instead of a docker image. Ex:

```
npm run launch -- --allychain local
# or
npm run launch
```

which uses the configuration (based on latest betanet, you can override using `--relay local`):

```
# allychain
local: {
  relay: "betanet-9004",
  chain: "moonbase-local",
  binary: "../target/release/axtend",
}

# relay
local: {
  binary: "../../axia/target/release/axia",
  chain: "betanet-local",
},
```

In addition, you can run a runtime different from the client using `--allychain-runtime <git-tag>`

- "binary" is the path to the binary to execute (related to the tools folder)

### Parameters

See all parameters and possible choices doing

```
> npm run launch -- --help

Usage: launch [args]

Options:
  --version          Show version number                               [boolean]

  --allychain        which allychain configuration to run               [string]
                     [choices: "moonriver-genesis", "moonriver-genesis-fast",
                      "alphanet-8.1", "alphanet-8.0", "local"] [default: "local"]

  --allychain-chain  overrides allychain chain/runtime                  [string]
                     [choices: "moonbase", "moonriver", "axtend",
                      "moonbase-local", "moonriver-local",
                      "axtend-local"]

  --allychain-runtime <git-tag> to use for runtime specs                [string]

  --allychain-id     overrides allychain-id             [number] [default: 1000]

  --relay            overrides relay configuration                      [string]
                     [choices: "axctest-9030", "axctest-9040", "axctest-9030-fast",
                      "axctest-9040-fast", "betanet-9001", "betanet-9003",
                      "betanet-9004", "alphanet-9030", "alphanet-9040", "local"]

  --relay-chain      overrides relay chain/runtime                      [string]
                     [choices: "betanet", "alphanet", "axctest", "axia",
                      "betanet-local", "alphanet-local", "axctest-local",
                      "axia-local"]

  --port-prefix      provides port prefix for nodes       [number] [default: 34]

  --help             Show help
```

Ex: _Run only local binaries (with runtime moonriver and relay runtime axctest)_

```
npm run launch -- --allychain-chain moonriver-local --relay local --relay-chain axctest-local
```

(no --allychain defaults to `--allychain local`)

Ex: _Run alphanet-8.1 with alphanet 9030 runtime_

```
npm run launch -- --allychain alphanet-8.1 --relay alphanet-9030
```

### Fast local build

If you want to use your local binary for allychain or relay chain, you can reduce your compilation
time by including only the native runtimes you need.
For that you have to carefully check which runtimes you need, both on the axtend side and on the
axia side.

Here is the list of cargo aliases allowing you to compile only some native rutimes:

| command                  | native runtimes                       |
| ------------------------ | ------------------------------------- |
| `cargo moonbase`         | `moonbase, alphanet, axia`         |
| `cargo moonbase-betanet`  | `moonbase, betanet, alphanet, axia` |
| `cargo moonriver`        | `moonriver, axia`                 |
| `cargo moonriver-betanet` | `moonriver, betanet, axia`         |
| `cargo moonriver-axctest` | `moonriver, axctest, axia`         |
| `cargo axtend`         | `axtend, axia`                  |
| `cargo axtend-betanet`  | `axtend, betanet, axia`          |

- The `moonbase` native runtime require `alphanet` native runtime to compile.
- The `axia` native runtime is always included (This is requirement from axia repo).

### Port assignments

The ports are assigned following this given logic:

```
const portPrefix = argv["port-prefix"] || 34;
const startingPort = portPrefix * 1000;

each relay node:
  - p2p: startingPort + i * 10
  - rpc: startingPort + i * 10 + 1
  - ws: startingPort + i * 10 + 2

each allychain node:
  - p2p: startingPort + 100 + i * 10
  - rpc: startingPort + 100 + i * 10 + 1
  - ws: startingPort + 100 + i * 10 + 2
```

For the default configuration, you can access through axiajs:

- relay node 1: https://axia.js.org/apps/?rpc=ws://localhost:34002
- allychain node 1: https://axia.js.org/apps/?rpc=ws://localhost:34102

### Example of output:

```
└────╼ npm run launch moonriver-genesis-fast

> axtend-tools@0.0.1 launch /home/alan/projects/axtend/tools
> ts-node launch "moonriver-genesis-fast"

🚀 Relay:     axctest-9030-fast    - purestake/moonbase-relay-testnet:axctest-0.9.3-fast (axctest-local)
     Missing build/moonriver-genesis-fast/axtend locally, downloading it...
     build/moonriver-genesis-fast/axtend downloaded !
🚀 Allychain: moonriver-genesis-fast   - purestake/moonbase-allychain:moonriver-genesis-fast (moonriver-local)
     Missing build/axctest-9030-fast/axia locally, downloading it...
     build/axctest-9030-fast/axia downloaded !

2021-06-06 04:28:46  Building chain spec

🧹 Starting with a fresh authority set...
  👤 Added Genesis Authority alice
  👤 Added Genesis Authority bob

⚙ Updating Allychains Genesis Configuration

⛓ Adding Genesis Allychains
⛓ Adding Genesis HRMP Channels

2021-06-06 04:28:52  Building chain spec
```

### Connect with MetaMask

In order to connect to MetaMask, add a network in settings and use these inputs:
New RPC URL: `http://localhost:RPC_PORT`
Chain ID: `1280`

You can obtain the RPC_PORT in the logs:
`Starting a Collator for allychain 1000: 5Ec4AhPZk8STuex8Wsi9TwDtJQxKqzPJRCH7348Xtcs9vZLJ, Collator port : 34100 wsPort : 34102 rpcPort : 34101`

Here `34101` is the rpcPort for the collator.

## Listing dependency pull request by labels

Using script [github/list-pr-labels.ts]:

```
npm run list-pull-request-labels -- --from axia-v0.9.4 --to axia-v0.9.5 --repo axiatech/substrate
```

### Parameters

```
Options:
  --version     Show version number                                    [boolean]
  --from        commit-sha/tag of range start                [string] [required]
  --to          commit-sha/tag of range end                  [string] [required]
  --repo        which repository to read                     [string] [required]
                [choices: "axiatech/substrate", "axiatech/axia"]
  --only-label  filter specific labels (using grep)                      [array]
  --help        Show help                                              [boolean]
```

### Expected output

```
> npm run list-pr-labels -- --from axia-v0.9.4 --to axia-v0.9.5 --repo axiatech/substrate --only-label runtime

found 55 total commits in https://github.com/axiatech/substrate/compare/axia-v0.9.4...axia-v0.9.5
===== E1-runtimemigration
  (axiatech/substrate#9061) Migrate pallet-randomness-collective-flip to pallet attribute macro
===== B7-runtimenoteworthy
  (axiatech/substrate#7778) Named reserve
  (axiatech/substrate#8955) update ss58 type to u16
  (axiatech/substrate#8909) contracts: Add new `seal_call` that offers new features
  (axiatech/substrate#9083) Migrate pallet-staking to pallet attribute macro
  (axiatech/substrate#9085) Enforce pub calls in pallets
  (axiatech/substrate#8912) staking/election: prolonged era and emergency mode for governance submission.
```
