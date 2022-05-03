import Keyring from "@axia/keyring";
import { expect } from "chai";
import { ALITH, ALITH_PRIV_KEY } from "../util/constants";

import { describeDevAxtend } from "../util/setup-dev-tests";
import { createBlockWithExtrinsic } from "../util/substrate-rpc";

const TEST_ACCOUNT = "0x1111111111111111111111111111111111111111";

// A call from root (sudo) can make a transfer directly in pallet_evm
// A signed call cannot make a transfer directly in pallet_evm

describeDevAxtend("Pallet EVM transfer - no sudo", (context) => {
  let events;
  before("Send a simple transfer with pallet evm", async () => {
    const keyring = new Keyring({ type: "ethereum" });
    const alith = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
    ({ events } = await createBlockWithExtrinsic(
      context,
      alith,
      context.axiaApi.tx.evm.call(
        ALITH,
        TEST_ACCOUNT,
        "0x0",
        100_000_000_000_000_000_000n,
        12_000_000n,
        1_000_000_000n,
        0,
        undefined,
        []
      )
    ));
  });

  it("should fail without sudo", async function () {
    expect(events[5].toHuman().method).to.eq("ExtrinsicFailed");
    expect(await context.web3.eth.getBalance(TEST_ACCOUNT)).to.equal("0");
  });
});
describeDevAxtend("Pallet EVM transfer - with sudo", (context) => {
  let events;
  before("Send a simple transfer with pallet evm with sudo", async () => {
    const keyring = new Keyring({ type: "ethereum" });
    const alith = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");

    ({ events } = await createBlockWithExtrinsic(
      context,
      alith,
      context.axiaApi.tx.sudo.sudo(
        context.axiaApi.tx.evm.call(
          ALITH,
          TEST_ACCOUNT,
          "0x0",
          100_000_000_000_000_000_000n,
          12_000_000n,
          1_000_000_000n,
          0,
          undefined,
          []
        )
      )
    ));
  });

  it("should succeed with sudo", async function () {
    expect(events[13].toHuman().method).to.eq("ExtrinsicSuccess");
    expect(await context.web3.eth.getBalance(TEST_ACCOUNT)).to.equal(
      100_000_000_000_000_000_000n.toString()
    );
  });
});
