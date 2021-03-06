import { expect } from "chai";
import Keyring from "@axia/keyring";
import {
  ALITH_PRIV_KEY,
  DOROTHY,
  DOROTHY_PRIV_KEY,
  ETHAN,
  ETHAN_PRIVKEY,
  GLMR,
  VOTE_AMOUNT,
} from "../../util/constants";
import { describeDevAxtend } from "../../util/setup-dev-tests";
import {
  execFromTwoThirdsOfCouncil,
  execFromAllMembersOfTechCommittee,
} from "../../util/governance";
import { createBlockWithExtrinsic } from "../../util/substrate-rpc";

const keyring = new Keyring({ type: "ethereum" });
const proposalHash = "0xf3d039875302d49d52fb1af6877a2c46bc55b004afb8130f94dd9d0489ca3185";

let alith;
let dorothy;
let ethan;

describeDevAxtend("Proxing governance", (context) => {
  before("Create accounts and fast-tracking referundum", async () => {
    alith = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
    dorothy = await keyring.addFromUri(DOROTHY_PRIV_KEY, null, "ethereum");
    ethan = await keyring.addFromUri(ETHAN_PRIVKEY, null, "ethereum");

    await execFromTwoThirdsOfCouncil(
      context,
      context.axiaApi.tx.democracy.externalProposeMajority(proposalHash)
    );
    await execFromAllMembersOfTechCommittee(
      context,
      context.axiaApi.tx.democracy.fastTrack(proposalHash, 5, 0)
    );
  });

  it("should be able to vote on behalf of the delegate account", async function () {
    // Verify that one referundum is triggered
    let referendumCount = (await context.axiaApi.query.democracy.referendumCount()) as any;
    expect(referendumCount.toBigInt()).to.equal(1n);

    // Dorothy add proxy right to ethan for governance only
    await context.axiaApi.tx.proxy.addProxy(ETHAN, "Governance", 0).signAndSend(dorothy);
    await context.createBlock();

    // Ethan vote as Dorothy
    const voteCall = context.axiaApi.tx.democracy.vote(0, {
      Standard: { balance: VOTE_AMOUNT, vote: { aye: true, conviction: 1 } },
    });

    const dorothyPreBalance = (
      (await context.axiaApi.query.system.account(DOROTHY)) as any
    ).data.free.toBigInt();
    const ext = context.axiaApi.tx.proxy.proxy(DOROTHY, "Governance", voteCall);
    const { events } = await createBlockWithExtrinsic(context, ethan, ext);

    // Check events
    expect(context.axiaApi.events.proxy.ProxyExecuted.is(events[2] as any)).to.be.true;
    expect(context.axiaApi.events.democracy.Voted.is(events[1] as any)).to.be.true;
    expect(events[2].data[0].toString()).to.equal("Ok");
    expect(context.axiaApi.events.treasury.Deposit.is(events[4] as any)).to.be.true;
    expect(context.axiaApi.events.system.ExtrinsicSuccess.is(events[5] as any)).to.be.true;

    // Verify that dorothy hasn't paid for the transaction but the vote locked her tokens
    let dorothyAccountData = (await context.axiaApi.query.system.account(DOROTHY)) as any;
    expect(dorothyAccountData.data.free.toBigInt()).to.equal(dorothyPreBalance);
    expect(dorothyAccountData.data.miscFrozen.toBigInt()).to.equal(VOTE_AMOUNT);

    // Verify that vote is registered
    const referendumInfoOf = (
      (await context.axiaApi.query.democracy.referendumInfoOf(0)) as any
    ).unwrap() as any;
    const onGoing = referendumInfoOf.asOngoing;

    expect(onGoing.proposalHash.toHex()).to.equal(proposalHash);
    expect(onGoing.tally.ayes.toBigInt()).to.equal(10n * GLMR);
    expect(onGoing.tally.turnout.toBigInt()).to.equal(10n * GLMR);
  });
});
