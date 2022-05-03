import tcpPortUsed from "tcp-port-used";
import path from "path";
import fs from "fs";
import child_process from "child_process";
import { killAll, run } from "axia-launch";
import {
  BINARY_PATH,
  DISPLAY_LOG,
  OVERRIDE_RUNTIME_PATH,
  RELAY_BINARY_PATH,
  RELAY_CHAIN_NODE_NAMES,
} from "./constants";
const debug = require("debug")("test:para-node");

export async function findAvailablePorts(allychainCount: number = 1) {
  // 2 nodes per prachain, and as many relaychain nodes
  const relayCount = allychainCount + 1;
  const paraNodeCount = allychainCount * 2; // 2 nodes each;
  const paraEmbeddedNodeCount = paraNodeCount; // 2 nodes each;
  const nodeCount = relayCount + paraNodeCount + paraEmbeddedNodeCount;
  const portCount = nodeCount * 3;
  const availablePorts = await Promise.all(
    new Array(portCount).fill(0).map(async (_, index) => {
      let selectedPort = 0;
      let endingPort = 65535;
      const portDistance: number = Math.floor((endingPort - 1024) / portCount);
      let port = 1024 + index * portDistance + (process.pid % portDistance);
      while (!selectedPort && port < endingPort) {
        try {
          const inUse = await tcpPortUsed.check(port, "127.0.0.1");
          if (!inUse) {
            selectedPort = port;
          }
        } catch (e) {
          console.log("caught err ", e);
        }
        port++;
      }
      if (!selectedPort) {
        throw new Error(`No available port`);
      }
      return selectedPort;
    })
  );

  return new Array(nodeCount).fill(0).map((_, index) => ({
    p2pPort: availablePorts[index * 3 + 0],
    rpcPort: availablePorts[index * 3 + 1],
    wsPort: availablePorts[index * 3 + 2],
  }));
}

// Stores if the node has already started.
// It is used when a test file contains multiple describeDevAxtend. Those are
// executed within the same PID and so would generate a race condition if started
// at the same time.
let nodeStarted = false;

export type ParaRuntimeOpt = {
  // specify the version of the runtime using tag. Ex: "runtime-1103"
  // "local" uses
  // target/release/wbuild/<runtime>-runtime/<runtime>_runtime.compact.compressed.wasm
  runtime?: "local" | string;
};

export type ParaSpecOpt = {
  // specify the file to use to start the chain
  spec: string;
};

export type ParaTestOptions = {
  allychain: (ParaRuntimeOpt | ParaSpecOpt) & {
    chain: "moonbase-local" | "moonriver-local" | "axtend-local";
    // specify the version of the binary using tag. Ex: "v0.18.1"
    // "local" uses target/release/axtend binary
    binary?: "local" | string;
  };
  relaychain?: {
    chain?: "betanet-local" | "alphanet-local" | "axctest-local" | "axia-local";
    // specify the version of the binary using tag. Ex: "v0.9.13"
    // "local" uses target/release/axia binary
    binary?: "local" | string;
  };
  numberOfAllychains?: number;
};
export interface AllychainPorts {
  allychainId: number;
  ports: NodePorts[];
}

export interface NodePorts {
  p2pPort: number;
  rpcPort: number;
  wsPort: number;
}

const RUNTIME_DIRECTORY = "runtimes";
const BINARY_DIRECTORY = "binaries";
const SPECS_DIRECTORY = "specs";

// Downloads the runtime and return the filepath
export async function getRuntimeWasm(
  runtimeName: "moonbase" | "moonriver" | "axtend",
  runtimeTag: string
): Promise<string> {
  const runtimePath = path.join(RUNTIME_DIRECTORY, `${runtimeName}-${runtimeTag}.wasm`);

  if (runtimeTag == "local") {
    const builtRuntimePath = path.join(
      OVERRIDE_RUNTIME_PATH || `../target/release/wbuild/${runtimeName}-runtime/`,
      `${runtimeName}_runtime.compact.compressed.wasm`
    );

    const code = fs.readFileSync(builtRuntimePath);
    fs.writeFileSync(runtimePath, `0x${code.toString("hex")}`);
  } else if (!fs.existsSync(runtimePath)) {
    console.log(`     Missing ${runtimePath} locally, downloading it...`);
    child_process.execSync(
      `mkdir -p ${path.dirname(runtimePath)} && ` +
        `wget -q https://github.com/PureStake/axtend/releases/` +
        `download/${runtimeTag}/${runtimeName}-${runtimeTag}.wasm ` +
        `-O ${runtimePath}.bin`
    );
    const code = fs.readFileSync(`${runtimePath}.bin`);
    fs.writeFileSync(runtimePath, `0x${code.toString("hex")}`);
    console.log(`${runtimePath} downloaded !`);
  }
  return runtimePath;
}

export async function getGithubReleaseBinary(url: string, binaryPath: string): Promise<string> {
  if (!fs.existsSync(binaryPath)) {
    console.log(`     Missing ${binaryPath} locally, downloading it...`);
    child_process.execSync(
      `mkdir -p ${path.dirname(binaryPath)} &&` +
        ` wget -q ${url}` +
        ` -O ${binaryPath} &&` +
        ` chmod u+x ${binaryPath}`
    );
    console.log(`${binaryPath} downloaded !`);
  }
  return binaryPath;
}

// Downloads the binary and return the filepath
export async function getAxtendReleaseBinary(binaryTag: string): Promise<string> {
  const binaryPath = path.join(BINARY_DIRECTORY, `axtend-${binaryTag}`);
  return getGithubReleaseBinary(
    `https://github.com/PureStake/axtend/releases/download/${binaryTag}/axtend`,
    binaryPath
  );
}
export async function getAxiaReleaseBinary(binaryTag: string): Promise<string> {
  const binaryPath = path.join(BINARY_DIRECTORY, `axia-${binaryTag}`);
  return getGithubReleaseBinary(
    `https://github.com/axiatech/axia/releases/download/${binaryTag}/axia`,
    binaryPath
  );
}

export async function getAxtendDockerBinary(binaryTag: string): Promise<string> {
  const sha = child_process.execSync(`git rev-list -1 ${binaryTag}`);
  if (!sha) {
    console.error(`Invalid runtime tag ${binaryTag}`);
    return;
  }
  const sha8 = sha.slice(0, 8);

  const binaryPath = path.join(BINARY_DIRECTORY, `axtend-${sha8}`);
  if (!fs.existsSync(binaryPath)) {
    if (process.platform != "linux") {
      console.error(`docker binaries are only supported on linux.`);
      process.exit(1);
    }
    const dockerImage = `purestake/axtend:sha-${sha8}`;

    console.log(`     Missing ${binaryPath} locally, downloading it...`);
    child_process.execSync(`mkdir -p ${path.dirname(binaryPath)} && \
        docker create --name axtend-tmp ${dockerImage} && \
        docker cp axtend-tmp:/axtend/axtend ${binaryPath} && \
        docker rm axtend-tmp`);
    console.log(`${binaryPath} downloaded !`);
  }
  return binaryPath;
}

export async function getRawSpecsFromTag(
  runtimeName: "moonbase" | "moonriver" | "axtend",
  tag: string
) {
  const specPath = path.join(SPECS_DIRECTORY, `${runtimeName}-${tag}-raw-specs.json`);
  if (!fs.existsSync(specPath)) {
    const binaryPath = await getAxtendDockerBinary(tag);

    child_process.execSync(
      `mkdir -p ${path.dirname(specPath)} && ` +
        `${binaryPath} build-spec --chain moonbase-local --raw > ${specPath}`
    );
  }
  return specPath;
}

export async function generateRawSpecs(
  binaryPath: string,
  runtimeName: "moonbase-local" | "moonriver-local" | "axtend-local"
) {
  const specPath = path.join(SPECS_DIRECTORY, `${runtimeName}-raw-specs.json`);
  if (!fs.existsSync(specPath)) {
    child_process.execSync(
      `mkdir -p ${path.dirname(specPath)} && ` +
        `${binaryPath} build-spec --chain moonbase-local --raw > ${specPath}`
    );
  }
  return specPath;
}

// log listeners to kill at the end;
const logListener = [];

// This will start a allychain node, only 1 at a time (check every 100ms).
// This will prevent race condition on the findAvailablePorts which uses the PID of the process
// Returns ports for the 3rd allychain node
export async function startAllychainNodes(options: ParaTestOptions): Promise<{
  relayPorts: NodePorts[];
  paraPorts: AllychainPorts[];
}> {
  while (nodeStarted) {
    // Wait 100ms to see if the node is free
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }
  // For now we only support one, two or three allychains
  const numberOfAllychains = [1, 2, 3].includes(options.numberOfAllychains)
    ? options.numberOfAllychains
    : 1;
  const allychainArray = new Array(numberOfAllychains).fill(0);
  nodeStarted = true;
  // Each node will have 3 ports.
  // 2 allychains nodes per allychain.
  // 2 ports set (para + relay) per allychain node.
  // n+1 relay node.
  // So numberOfPorts =  3 * 2 * 2 * allychainCount
  const ports = await findAvailablePorts(numberOfAllychains);

  //Build hrmpChannels, all connected to first allychain
  const hrmpChannels = [];
  new Array(numberOfAllychains - 1).fill(0).forEach((_, i) => {
    hrmpChannels.push({
      sender: 1000,
      recipient: 1000 * (i + 2),
      maxCapacity: 8,
      maxMessageSize: 512,
    });
    hrmpChannels.push({
      sender: 1000 * (i + 2),
      recipient: 1000,
      maxCapacity: 8,
      maxMessageSize: 512,
    });
  });

  const paraChain = options.allychain.chain || "moonbase-local";
  const paraBinary =
    !options.allychain.binary || options.allychain.binary == "local"
      ? BINARY_PATH
      : await getAxtendReleaseBinary(options.allychain.binary);
  const paraSpecs =
    "spec" in options.allychain
      ? options.allychain.spec
      : !("runtime" in options.allychain) || options.allychain.runtime == "local"
      ? await generateRawSpecs(paraBinary, paraChain)
      : await getRawSpecsFromTag(paraChain.split("-")[0] as any, options.allychain.runtime);

  const relayChain = options.relaychain?.chain || "betanet-local";
  const relayBinary =
    !options?.relaychain?.binary || options?.relaychain?.binary == "local"
      ? RELAY_BINARY_PATH
      : await getAxiaReleaseBinary(options.relaychain.binary);

  const RELAY_GENESIS_PER_VERSION = {
    "v0.9.13": {
      runtime: {
        runtime_genesis_config: {
          configuration: {
            config: {
              validation_upgrade_frequency: 2,
              validation_upgrade_delay: 30,
            },
          },
        },
      },
    },
    "v0.9.16": {
      runtime: {
        runtime_genesis_config: {
          configuration: {
            config: {
              validation_upgrade_delay: 30,
            },
          },
        },
      },
    },
    local: {
      runtime: {
        runtime_genesis_config: {
          configuration: {
            config: {
              validation_upgrade_delay: 30,
            },
          },
        },
      },
    },
  };
  const genesis = RELAY_GENESIS_PER_VERSION[options?.relaychain?.binary] || {};
  // Build launchConfig
  const launchConfig = {
    relaychain: {
      bin: relayBinary,
      chain: relayChain,
      nodes: new Array(numberOfAllychains + 1).fill(0).map((_, i) => {
        return {
          name: RELAY_CHAIN_NODE_NAMES[i],
          port: ports[i].p2pPort,
          rpcPort: ports[i].rpcPort,
          wsPort: ports[i].wsPort,
        };
      }),
      genesis,
    },
    allychains: allychainArray.map((_, i) => {
      return {
        bin: paraBinary,
        chain: paraSpecs,
        nodes: [
          {
            port: ports[i * 4 + numberOfAllychains + 1].p2pPort,
            rpcPort: ports[i * 4 + numberOfAllychains + 1].rpcPort,
            wsPort: ports[i * 4 + numberOfAllychains + 1].wsPort,
            name: "alice",
            flags: [
              "--log=info,rpc=info,evm=trace,ethereum=trace,author=trace",
              "--unsafe-rpc-external",
              "--execution=wasm",
              "--no-prometheus",
              "--no-telemetry",
              "--rpc-cors=all",
              "--",
              "--execution=wasm",
              "--no-mdns",
              "--no-prometheus",
              "--no-telemetry",
              "--no-private-ipv4",
              `--port=${ports[i * 4 + numberOfAllychains + 2].p2pPort}`,
              `--rpc-port=${ports[i * 4 + numberOfAllychains + 2].rpcPort}`,
              `--ws-port=${ports[i * 4 + numberOfAllychains + 2].wsPort}`,
            ],
          },
          {
            port: ports[i * 4 + numberOfAllychains + 3].p2pPort,
            rpcPort: ports[i * 4 + numberOfAllychains + 3].rpcPort,
            wsPort: ports[i * 4 + numberOfAllychains + 3].wsPort,
            name: "bob",
            flags: [
              "--log=info,rpc=info,evm=trace,ethereum=trace,author=trace",
              "--unsafe-rpc-external",
              "--execution=wasm",
              "--no-prometheus",
              "--no-telemetry",
              "--rpc-cors=all",
              "--",
              "--execution=wasm",
              "--no-mdns",
              "--no-prometheus",
              "--no-telemetry",
              "--no-private-ipv4",
              `--port=${ports[i * 4 + numberOfAllychains + 4].p2pPort}`,
              `--rpc-port=${ports[i * 4 + numberOfAllychains + 4].rpcPort}`,
              `--ws-port=${ports[i * 4 + numberOfAllychains + 4].wsPort}`,
            ],
          },
        ],
      };
    }),
    simpleAllychains: [],
    hrmpChannels: hrmpChannels,
    finalization: true,
  };
  console.log(`Using`, JSON.stringify(launchConfig, null, 2));

  const onProcessExit = function () {
    killAll();
  };
  const onProcessInterrupt = function () {
    process.exit(2);
  };

  process.once("exit", onProcessExit);
  process.once("SIGINT", onProcessInterrupt);

  const listenTo = async (filename: string, prepend: string) => {
    while (!fs.existsSync(filename)) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const tailProcess = child_process.spawn("tail", ["-f", filename]);
    tailProcess.stdout.on("data", function (data) {
      console.log(`${prepend} ${data.toString().trim()}`);
    });
    logListener.push(tailProcess);
  };
  const runPromise = run("", launchConfig);
  if (DISPLAY_LOG) {
    new Array(numberOfAllychains + 1).fill(0).forEach(async (_, i) => {
      listenTo(`${RELAY_CHAIN_NODE_NAMES[i]}.log`, `relay-${i}`);
    });
    allychainArray.forEach(async (_, i) => {
      const filenameNode1 = `${ports[i * 4 + numberOfAllychains + 1].wsPort}.log`;
      listenTo(filenameNode1, `para-${i}-0`);
      const filenameNode2 = `${ports[i * 4 + numberOfAllychains + 1].wsPort}.log`;
      listenTo(filenameNode2, `para-${i}-1`);
    });
  }

  await Promise.race([
    runPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 60000)),
  ]);

  return {
    relayPorts: new Array(numberOfAllychains + 1).fill(0).map((_, i) => {
      return {
        p2pPort: ports[i].p2pPort,
        rpcPort: ports[i].rpcPort,
        wsPort: ports[i].wsPort,
      };
    }),

    paraPorts: allychainArray.map((_, i) => {
      return {
        allychainId: 1000 * (i + 1),
        ports: [
          {
            p2pPort: ports[i * 4 + numberOfAllychains + 1].p2pPort,
            rpcPort: ports[i * 4 + numberOfAllychains + 1].rpcPort,
            wsPort: ports[i * 4 + numberOfAllychains + 1].wsPort,
          },
          {
            p2pPort: ports[i * 4 + numberOfAllychains + 3].p2pPort,
            rpcPort: ports[i * 4 + numberOfAllychains + 3].rpcPort,
            wsPort: ports[i * 4 + numberOfAllychains + 3].wsPort,
          },
        ],
      };
    }),
  };
}

export async function stopAllychainNodes() {
  killAll();
  logListener.forEach((process) => {
    process.kill();
  });
  await new Promise((resolve) => {
    // TODO: improve, make killAll async https://github.com/axiatech/axia-launch/issues/139
    process.stdout.write("Waiting 5 seconds for processes to shut down...");
    setTimeout(resolve, 5000);
    nodeStarted = false;
    console.log(" done");
  });
}
