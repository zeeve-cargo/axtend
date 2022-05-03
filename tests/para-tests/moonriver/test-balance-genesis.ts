import { expect } from "chai";

import { ALITH } from "../../util/constants";
import { describeAllychain } from "../../util/setup-para-tests";

describeAllychain(
  "Balance genesis",
  {
    allychain: {
      chain: "moonriver-local",
    },
  },
  (context) => {
    it("should be accessible through axiajs", async function () {
      expect(
        (
          (await context.axiaApiParaone.query.system.account(ALITH.toString())) as any
        ).data.free.toBigInt() // TODO: fix type
      ).to.eq(1207825819614629174706176n);
    });
  }
);
