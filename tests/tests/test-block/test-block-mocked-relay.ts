import { expect } from "chai";
import { describeDevAxtend } from "../../util/setup-dev-tests";

describeDevAxtend("Block - Mocked relaychain block", (context) => {
  it("should contain mock relay chain block information", async function () {
    const blockResult = await context.createBlock();
    const blockData = await context.axiaApi.rpc.chain.getBlock(blockResult.block.hash);
    expect(
      (
        blockData.block.extrinsics[1].method.args[0] as any
      ).validationData.relayParentNumber.toString()
    ).to.eq("1000");
    const blockResult2 = await context.createBlock();
    const blockData2 = await context.axiaApi.rpc.chain.getBlock(blockResult2.block.hash);
    expect(
      (
        blockData2.block.extrinsics[1].method.args[0] as any
      ).validationData.relayParentNumber.toString()
    ).to.eq("1002");
  });
});
