import Keyring from "@axia/keyring";
import { expect } from "chai";
import { BN } from "@axia/util";
import { ALITH, ALITH_PRIV_KEY, BALTATHAR } from "../util/constants";

import { describeDevAxtend } from "../util/setup-dev-tests";
import { createBlockWithExtrinsic } from "../util/substrate-rpc";
import { mockAssetBalance } from "./test-precompile/test-precompile-assets-erc20";

const TEST_ACCOUNT = "0x1111111111111111111111111111111111111111";

describeDevAxtend("Pallet Assets Pallet - assets transfer", (context) => {
  let sudoAccount, assetId;
  before("Test querying asset", async () => {
    const keyring = new Keyring({ type: "ethereum" });
    sudoAccount = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");

    // We need to mint units with sudo.setStorage, as we dont have xcm mocker yet
    // And we need relay tokens for issuing a transaction to be executed in the relay
    const balance = context.axiaApi.createType("Balance", 100000000000000);
    const assetBalance = context.axiaApi.createType("PalletAssetsAssetAccount", {
      balance: balance,
    });

    assetId = context.axiaApi.createType(
      "u128",
      new BN("42259045809535163221576417993425387648")
    );
    const assetDetails = context.axiaApi.createType("PalletAssetsAssetDetails", {
      supply: balance,
    });

    await mockAssetBalance(context, assetBalance, assetDetails, sudoAccount, assetId, ALITH);

    await createBlockWithExtrinsic(
      context,
      sudoAccount,
      context.axiaApi.tx.assets.transfer(assetId, BALTATHAR, 1000)
    );
  });

  it("should query asset balance", async function () {
    // Baltathar balance is 1000
    let baltatharBalance = (await context.axiaApi.query.assets.account(
      assetId,
      BALTATHAR
    )) as any;
    expect(baltatharBalance.unwrap()["balance"].eq(new BN(1000))).to.equal(true);
  });
});
