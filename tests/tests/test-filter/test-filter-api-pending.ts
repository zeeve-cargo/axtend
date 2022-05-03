import { expect } from "chai";
import { customWeb3Request } from "../../util/providers";
import { describeDevAxtend } from "../../util/setup-dev-tests";

describeDevAxtend("Filter Pending Transaction API", (context) => {
  it("should not be supported", async function () {
    const result = await customWeb3Request(context.web3, "eth_newPendingTransactionFilter", []);
    expect(result.error).to.include({
      message: "Method not available.",
    });
  });
});
