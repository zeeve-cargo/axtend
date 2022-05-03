import { expect } from "chai";
import { describeDevAxtend } from "../util/setup-dev-tests";
import Keyring from "@axia/keyring";
import { ALITH, ALITH_PRIV_KEY } from "../util/constants";

describeDevAxtend("Precompiles - xcm transactor", (context) => {
  let sudoAccount;
  before("Setup genesis account and relay accounts", async () => {
    const keyring = new Keyring({ type: "ethereum" });
    sudoAccount = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
    // register index 0 for Alith
    await context.axiaApi.tx.sudo
      .sudo(context.axiaApi.tx.xcmTransactor.register(ALITH, 0))
      .signAndSend(sudoAccount);
    await context.createBlock();
  });

  it("allows to retrieve index through precompiles", async function () {
    const resp = await context.axiaApi.query.xcmTransactor.indexToAccount(0);
    expect(resp.toString()).to.eq(ALITH);
  });
});
