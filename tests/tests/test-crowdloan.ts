import { Keyring } from "@axia/api";
import { KeyringPair } from "@axia/keyring/types";
import { expect } from "chai";
import Web3 from "web3";
import { Account } from "web3-core";
import { stringToU8a } from "@axia/util";
import type { SubmittableExtrinsic } from "@axia/api/promise/types";
import { blake2AsHex, randomAsHex } from "@axia/util-crypto";
import { createBlockWithExtrinsic } from "../util/substrate-rpc";

import {
  GENESIS_ACCOUNT,
  GENESIS_ACCOUNT_BALANCE,
  GENESIS_ACCOUNT_PRIVATE_KEY,
  GLMR,
  ALITH_PRIV_KEY,
  ALITH,
  BALTATHAR_PRIVATE_KEY,
  relayChainAddress,
  relayChainAddress_2,
} from "../util/constants";
import { describeDevAxtend, DevTestContext } from "../util/setup-dev-tests";
import { verifyLatestBlockFees } from "../util/block";

// 5 blocks per minute, 4 weeks
export const VESTING_PERIOD = 201600n;
async function calculate_vested_amount(context, totalReward, initialPayment, numberOfBlocks) {
  const amountToVest = BigInt(totalReward) - BigInt(initialPayment);
  // On average a allychain only gets a candidate into every other relay chain block.
  // In the dev service, where the relay block number is mocked, we get exactly two relay blocks.
  const elapsedRelayBlocks = numberOfBlocks * 2;
  const amountForBlocks = (BigInt(amountToVest) * BigInt(elapsedRelayBlocks)) / VESTING_PERIOD;
  const shouldHaveVested = BigInt(initialPayment) + amountForBlocks;
  return shouldHaveVested;
}

// Return the unwrapped accountsPayable or null otherwise
export const getAccountPayable = async (
  context: DevTestContext,
  address: string
): Promise<{
  totalReward: any;
  claimedReward: any;
  contributedRelayAddresses: any;
} | null> => {
  const accountsPayable = (await context.axiaApi.query.crowdloanRewards.accountsPayable(
    address
  )) as any;
  return accountsPayable.unwrapOr(null);
};

describeDevAxtend("Crowdloan", (context) => {
  let genesisAccount: KeyringPair, sudoAccount: KeyringPair;

  before("Setup genesis account for substrate", async () => {
    const keyring = new Keyring({ type: "ethereum" });
    genesisAccount = await keyring.addFromUri(GENESIS_ACCOUNT_PRIVATE_KEY, null, "ethereum");
    sudoAccount = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
  });

  it("should check initial state", async function () {
    // check that genesis has genesis balance
    expect(Number(await context.web3.eth.getBalance(GENESIS_ACCOUNT))).to.eq(
      Number(GENESIS_ACCOUNT_BALANCE)
    );
    // check that genesis is not registered
    const isPayable = await getAccountPayable(context, GENESIS_ACCOUNT);
    expect(isPayable).to.equal(null);
  });

  it("should be able to register the genesis account for reward", async function () {
    // should be able to register the genesis account for reward
    await context.axiaApi.tx.sudo
      .sudo(
        context.axiaApi.tx.crowdloanRewards.initializeRewardVec([
          [relayChainAddress, GENESIS_ACCOUNT, 3_000_000n * GLMR],
        ])
      )
      .signAndSend(sudoAccount);
    await context.createBlock();

    await verifyLatestBlockFees(context, expect, 3_000_000n);

    let initBlock = (await context.axiaApi.query.crowdloanRewards.initRelayBlock()) as any;

    // Complete initialization
    await context.axiaApi.tx.sudo
      .sudo(
        context.axiaApi.tx.crowdloanRewards.completeInitialization(
          initBlock.toBigInt() + VESTING_PERIOD
        )
      )
      .signAndSend(sudoAccount);
    await context.createBlock();

    expect((await getAccountPayable(context, GENESIS_ACCOUNT)).totalReward.toBigInt()).to.equal(
      3_000_000n * GLMR
    );
    let isInitialized = await context.axiaApi.query.crowdloanRewards.initialized();
    expect(isInitialized.toHuman()).to.be.true;
  });
});

describeDevAxtend("Crowdloan", (context) => {
  let genesisAccount: KeyringPair, sudoAccount: KeyringPair;

  before("Setup genesis account for substrate", async () => {
    const keyring = new Keyring({ type: "ethereum" });
    genesisAccount = await keyring.addFromUri(GENESIS_ACCOUNT_PRIVATE_KEY, null, "ethereum");
    sudoAccount = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
  });

  it("should be able to make a first claim", async function () {
    await context.axiaApi.tx.sudo
      .sudo(
        context.axiaApi.tx.crowdloanRewards.initializeRewardVec([
          [relayChainAddress, GENESIS_ACCOUNT, 3_000_000n * GLMR],
        ])
      )
      .signAndSend(sudoAccount);
    await context.createBlock();

    let initBlock = (await context.axiaApi.query.crowdloanRewards.initRelayBlock()) as any;

    // Complete initialization
    await context.axiaApi.tx.sudo
      .sudo(
        context.axiaApi.tx.crowdloanRewards.completeInitialization(
          initBlock.toBigInt() + VESTING_PERIOD
        )
      )
      .signAndSend(sudoAccount);
    await context.createBlock();

    let rewardInfo = await getAccountPayable(context, GENESIS_ACCOUNT);
    let claimed = await calculate_vested_amount(
      context,
      rewardInfo.totalReward,
      rewardInfo.claimedReward,
      2
    );
    // construct a transaction
    const transfer = context.axiaApi.tx.crowdloanRewards.claim();
    await transfer.signAndSend(genesisAccount);
    const details = await context.axiaApi.rpc.payment.queryFeeDetails(transfer.toHex());
    const claimFee =
      details.inclusionFee.unwrap().baseFee.toBigInt() +
      details.inclusionFee.unwrap().lenFee.toBigInt() +
      details.inclusionFee.unwrap().adjustedWeightFee.toBigInt();

    await context.createBlock();

    expect((await getAccountPayable(context, GENESIS_ACCOUNT)).claimedReward.toBigInt()).to.equal(
      claimed
    );

    // check balances
    expect(
      BigInt(await context.web3.eth.getBalance(GENESIS_ACCOUNT)) - GENESIS_ACCOUNT_BALANCE
    ).to.equal(claimed - claimFee); // reduce the claim fee part;
    const account = (await context.axiaApi.query.system.account(GENESIS_ACCOUNT)) as any;
    expect(account.data.free.toBigInt() - GENESIS_ACCOUNT_BALANCE).to.equal(claimed - claimFee);
  });
});

describeDevAxtend("Crowdloan", (context) => {
  let genesisAccount: KeyringPair, sudoAccount: KeyringPair;

  before("Setup genesis account for substrate", async () => {
    const keyring = new Keyring({ type: "ethereum" });
    genesisAccount = await keyring.addFromUri(GENESIS_ACCOUNT_PRIVATE_KEY, null, "ethereum");
    sudoAccount = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
  });

  it("should show me the money after 5 blocks, after first claim was called", async function () {
    await context.axiaApi.tx.sudo
      .sudo(
        context.axiaApi.tx.crowdloanRewards.initializeRewardVec([
          [relayChainAddress, GENESIS_ACCOUNT, 3_000_000n * GLMR],
        ])
      )
      .signAndSend(sudoAccount);
    await context.createBlock();

    let initBlock = (await context.axiaApi.query.crowdloanRewards.initRelayBlock()) as any;

    // Complete initialization
    await context.axiaApi.tx.sudo
      .sudo(
        context.axiaApi.tx.crowdloanRewards.completeInitialization(
          initBlock.toBigInt() + VESTING_PERIOD
        )
      )
      .signAndSend(sudoAccount);
    await context.createBlock();

    let rewardInfo = await getAccountPayable(context, GENESIS_ACCOUNT);

    // construct a transaction
    const transfer = context.axiaApi.tx.crowdloanRewards.claim();
    await transfer.signAndSend(genesisAccount);

    await context.createBlock();

    // should show me the money after 5 blocks
    await context.createBlock();
    await context.createBlock();

    let claimed = await calculate_vested_amount(
      context,
      rewardInfo.totalReward,
      rewardInfo.claimedReward,
      5
    );

    await context.axiaApi.tx.crowdloanRewards.claim().signAndSend(genesisAccount);
    await context.createBlock();
    const isPayable4 = await getAccountPayable(context, GENESIS_ACCOUNT);
    expect(isPayable4.claimedReward.toBigInt()).to.equal(claimed);
  });
});

describeDevAxtend("Crowdloan", (context) => {
  let genesisAccount: KeyringPair, sudoAccount: KeyringPair;

  before("Setup genesis account for substrate", async () => {
    const keyring = new Keyring({ type: "ethereum" });
    genesisAccount = await keyring.addFromUri(GENESIS_ACCOUNT_PRIVATE_KEY, null, "ethereum");
    sudoAccount = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
  });

  it("should make first claim 5 blocks after initialization called", async function () {
    await context.axiaApi.tx.sudo
      .sudo(
        context.axiaApi.tx.crowdloanRewards.initializeRewardVec([
          [relayChainAddress, GENESIS_ACCOUNT, 3_000_000n * GLMR],
        ])
      )
      .signAndSend(sudoAccount);
    await context.createBlock();

    let initBlock = (await context.axiaApi.query.crowdloanRewards.initRelayBlock()) as any;

    // Complete initialization
    await context.axiaApi.tx.sudo
      .sudo(
        context.axiaApi.tx.crowdloanRewards.completeInitialization(
          initBlock.toBigInt() + VESTING_PERIOD
        )
      )
      .signAndSend(sudoAccount);
    await context.createBlock();

    let rewardInfo = await getAccountPayable(context, GENESIS_ACCOUNT);
    await context.createBlock();

    // should show me the money after 5 blocks
    await context.createBlock();
    await context.createBlock();
    let claimed = await calculate_vested_amount(
      context,
      rewardInfo.totalReward,
      rewardInfo.claimedReward,
      5
    );

    await context.axiaApi.tx.crowdloanRewards.claim().signAndSend(genesisAccount);
    await context.createBlock();

    const isPayable4 = await getAccountPayable(context, GENESIS_ACCOUNT);
    expect(isPayable4.claimedReward.toBigInt()).to.equal(claimed);
  });
});

describeDevAxtend("Crowdloan", (context) => {
  let genesisAccount: KeyringPair, sudoAccount: KeyringPair;

  before("Setup genesis account for substrate", async () => {
    const keyring = new Keyring({ type: "ethereum" });
    genesisAccount = await keyring.addFromUri(GENESIS_ACCOUNT_PRIVATE_KEY, null, "ethereum");
    sudoAccount = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
  });

  it("should not be able to call initializeRewardVec another time", async function () {
    await context.axiaApi.tx.sudo
      .sudo(
        context.axiaApi.tx.crowdloanRewards.initializeRewardVec([
          [relayChainAddress, GENESIS_ACCOUNT, 3_000_000n * GLMR],
        ])
      )
      .signAndSend(sudoAccount);
    await context.createBlock();

    let initBlock = (await context.axiaApi.query.crowdloanRewards.initRelayBlock()) as any;

    // Complete initialization
    await context.axiaApi.tx.sudo
      .sudo(
        context.axiaApi.tx.crowdloanRewards.completeInitialization(
          initBlock.toBigInt() + VESTING_PERIOD
        )
      )
      .signAndSend(sudoAccount);
    await context.createBlock();

    // should not be able to call initializeRewardVec another time
    await context.axiaApi.tx.sudo
      .sudo(
        context.axiaApi.tx.crowdloanRewards.initializeRewardVec([
          [relayChainAddress, ALITH, 1000n * GLMR],
        ])
      )
      .signAndSend(genesisAccount);
    await context.createBlock();
    expect(await getAccountPayable(context, ALITH)).to.equal(null);
  });
});

describeDevAxtend("Crowdloan", (context) => {
  let alithAccount: KeyringPair;

  before("Setup genesis account for substrate", async () => {
    const keyring = new Keyring({ type: "ethereum" });
    alithAccount = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
  });

  it("should be able to register the genesis account - with small amount", async function () {
    // initializeRewardVec
    await context.axiaApi.tx.sudo
      .sudo(
        context.axiaApi.tx.crowdloanRewards.initializeRewardVec([
          [relayChainAddress, ALITH, 3_000_000n * GLMR],
        ])
      )
      .signAndSend(alithAccount);
    await context.createBlock();

    let initBlock = (await context.axiaApi.query.crowdloanRewards.initRelayBlock()) as any;

    // Complete initialization
    await context.axiaApi.tx.sudo
      .sudo(
        context.axiaApi.tx.crowdloanRewards.completeInitialization(
          initBlock.toBigInt() + VESTING_PERIOD
        )
      )
      .signAndSend(alithAccount);
    await context.createBlock();

    expect((await getAccountPayable(context, ALITH)).totalReward.toBigInt()).to.equal(
      3_000_000n * GLMR
    );

    let rewardInfo = await getAccountPayable(context, ALITH);
    let claimed = await calculate_vested_amount(
      context,
      rewardInfo.totalReward,
      rewardInfo.claimedReward,
      2
    );
    // claim
    await context.axiaApi.tx.crowdloanRewards.claim().signAndSend(alithAccount);
    await context.createBlock();

    const isPayable4 = await getAccountPayable(context, ALITH);
    expect(isPayable4.claimedReward.toBigInt()).to.equal(claimed);
  });
});

describeDevAxtend("Crowdloan", (context) => {
  let sudoAccount: KeyringPair;

  let numberOfAccounts: number = 1000; // min 2
  let largInput: [string, string, bigint][];

  before("Setup genesis account for substrate", async () => {
    numberOfAccounts = Number(
      (await context.axiaApi.consts.crowdloanRewards.maxInitContributors) as any
    );
    const keyring = new Keyring({ type: "ethereum" });
    sudoAccount = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
  });

  it("should be able to register many accounts : " + numberOfAccounts, async function () {
    // should create a bunch of test eth accounts
    this.timeout(30000);
    let web3 = new Web3();
    // We need to make sure the rewards match the account funds. 3M GLMR/ number of accounts
    let accounts = new Array(numberOfAccounts).fill(0).map((_) => web3.eth.accounts.create());
    largInput = accounts.map((acc: Account, i: number) => {
      return [
        acc.address + "111111111111111111111111",
        acc.address,
        (3_000_000n * GLMR) / BigInt(numberOfAccounts),
      ];
    });
    expect(largInput.length).to.eq(numberOfAccounts);
    expect(largInput[0][1] !== largInput[numberOfAccounts - 1][1]).to.eq(true);

    // should be able to register many accounts
    await context.axiaApi.tx.sudo
      .sudo(context.axiaApi.tx.crowdloanRewards.initializeRewardVec(largInput))
      .signAndSend(sudoAccount);

    await context.createBlock();

    let initBlock = (await context.axiaApi.query.crowdloanRewards.initRelayBlock()) as any;

    // Complete initialization
    await context.axiaApi.tx.sudo
      .sudo(
        context.axiaApi.tx.crowdloanRewards.completeInitialization(
          initBlock.toBigInt() + VESTING_PERIOD
        )
      )
      .signAndSend(sudoAccount);
    await context.createBlock();

    const rewardPerContributor = (3_000_000n * GLMR) / BigInt(numberOfAccounts);
    await Promise.all(
      largInput.map(async (input) => {
        expect((await getAccountPayable(context, input[1])).totalReward.toBigInt()).to.equal(
          rewardPerContributor
        );
      })
    );
  });
});

describeDevAxtend("Crowdloan", (context) => {
  let sudoAccount: KeyringPair;

  let numberOfAccounts: number = 1000; // min 2
  let largInput: [string, string, bigint][];

  before("Setup genesis account for substrate", async () => {
    // We shouldnt be able to register as many accounts unless we do it in batches
    numberOfAccounts = Number(
      (await context.axiaApi.consts.crowdloanRewards.maxInitContributors) as any
    );
    const keyring = new Keyring({ type: "ethereum" });
    sudoAccount = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
  });

  it("should be able to register many accounts - batch : " + numberOfAccounts, async function () {
    // should create a bunch of test eth accounts
    this.timeout(20000);
    let web3 = new Web3();
    let accounts = new Array(numberOfAccounts).fill(0).map((_, i) => web3.eth.accounts.create());
    largInput = accounts.map((acc: Account, i: number) => {
      return [
        acc.address + "111111111111111111111111",
        acc.address,
        (3_000_000n * GLMR) / BigInt(numberOfAccounts),
      ];
    });
    expect(largInput.length).to.eq(numberOfAccounts);
    expect(largInput[0][1] !== largInput[numberOfAccounts - 1][1]).to.eq(true);

    // should be able to register many accounts
    await context.axiaApi.tx.utility
      .batch([
        await context.axiaApi.tx.sudo.sudo(
          context.axiaApi.tx.crowdloanRewards.initializeRewardVec(
            largInput.slice(0, Math.floor(numberOfAccounts / 3))
          )
        ),
        await context.axiaApi.tx.sudo.sudo(
          context.axiaApi.tx.crowdloanRewards.initializeRewardVec(
            largInput.slice(
              Math.floor(numberOfAccounts / 3),
              Math.floor((numberOfAccounts * 2) / 3)
            )
          )
        ),
        await context.axiaApi.tx.sudo.sudo(
          context.axiaApi.tx.crowdloanRewards.initializeRewardVec(
            largInput.slice(Math.floor((numberOfAccounts * 2) / 3), numberOfAccounts)
          )
        ),
      ])
      .signAndSend(sudoAccount);
    await context.createBlock();

    let initBlock = (await context.axiaApi.query.crowdloanRewards.initRelayBlock()) as any;

    // Complete initialization
    await context.axiaApi.tx.sudo
      .sudo(
        context.axiaApi.tx.crowdloanRewards.completeInitialization(
          initBlock.toBigInt() + VESTING_PERIOD
        )
      )
      .signAndSend(sudoAccount);
    await context.createBlock();

    await Promise.all(
      largInput.map(async (input) => {
        expect((await getAccountPayable(context, input[1])).totalReward.toBigInt()).to.equal(
          (3_000_000n * GLMR) / BigInt(numberOfAccounts)
        );
      })
    );
  });
});

describeDevAxtend("Crowdloan", (context) => {
  let sudoAccount: KeyringPair;

  before("Setup genesis account for substrate", async () => {
    const keyring = new Keyring({ type: "ethereum" });
    sudoAccount = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
  });

  it("should be able to initialize through democracy", async function () {
    let calls = [];
    // We are gonna put the initialization and completion in a batch_all utility call
    calls.push(
      context.axiaApi.tx.crowdloanRewards.initializeRewardVec([
        [relayChainAddress, GENESIS_ACCOUNT, 1_500_000n * GLMR],
        [relayChainAddress_2, null, 1_500_000n * GLMR],
      ])
    );

    let initBlock = (await context.axiaApi.query.crowdloanRewards.initRelayBlock()) as any;
    calls.push(
      context.axiaApi.tx.crowdloanRewards.completeInitialization(
        initBlock.toBigInt() + VESTING_PERIOD
      )
    );

    // Here we build the utility call
    const proposal = context.axiaApi.tx.utility.batchAll(calls);

    // We encode the proposal
    let encodedProposal = (proposal as SubmittableExtrinsic)?.method.toHex() || "";
    let encodedHash = blake2AsHex(encodedProposal);

    // Submit the pre-image
    await context.axiaApi.tx.democracy.notePreimage(encodedProposal).signAndSend(sudoAccount);

    await context.createBlock();

    // Propose
    await context.axiaApi.tx.democracy
      .propose(encodedHash, 1000n * GLMR)
      .signAndSend(sudoAccount);

    await context.createBlock();
    const publicPropCount = await context.axiaApi.query.democracy.publicPropCount();

    // we only use sudo to enact the proposal
    await context.axiaApi.tx.sudo
      .sudoUncheckedWeight(
        context.axiaApi.tx.democracy.enactProposal(encodedHash, publicPropCount),
        1
      )
      .signAndSend(sudoAccount);

    await context.createBlock();

    let isInitialized = await context.axiaApi.query.crowdloanRewards.initialized();

    expect(isInitialized.toHuman()).to.be.true;

    // Get reward info of associated
    let reward_info_associated = await getAccountPayable(context, GENESIS_ACCOUNT);

    // Get reward info of unassociated
    let reward_info_unassociated = (
      (await context.axiaApi.query.crowdloanRewards.unassociatedContributions(
        relayChainAddress_2
      )) as any
    ).unwrap();

    // Check payments
    expect(reward_info_associated.totalReward.toBigInt()).to.equal(1_500_000n * GLMR);

    expect(reward_info_associated.claimedReward.toBigInt()).to.equal(450_000n * GLMR);

    expect(reward_info_unassociated.totalReward.toBigInt()).to.equal(1_500_000n * GLMR);

    expect(reward_info_unassociated.claimedReward.toBigInt()).to.equal(0n);

    // check balances
    const account = (await context.axiaApi.query.system.account(GENESIS_ACCOUNT)) as any;
    expect(account.data.free.toBigInt() - GENESIS_ACCOUNT_BALANCE).to.equal(
      reward_info_associated.claimedReward.toBigInt()
    );
  });
});

describeDevAxtend("Crowdloan", (context) => {
  let sudoAccount: KeyringPair;

  before("Setup genesis account for substrate", async () => {
    const keyring = new Keyring({ type: "ethereum" });
    sudoAccount = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
  });

  it("should be able to burn the dust", async function () {
    await context.axiaApi.tx.sudo
      .sudo(
        context.axiaApi.tx.crowdloanRewards.initializeRewardVec([
          [relayChainAddress, GENESIS_ACCOUNT, 1_500_000n * GLMR],
          [relayChainAddress_2, null, 1_499_999_999_999_999_999_999_999n],
        ])
      )
      .signAndSend(sudoAccount);
    await context.createBlock();

    let initBlock = (await context.axiaApi.query.crowdloanRewards.initRelayBlock()) as any;
    let previousIssuance = (await context.axiaApi.query.balances.totalIssuance()) as any;

    // Complete initialization
    await context.axiaApi.tx.sudo
      .sudo(
        context.axiaApi.tx.crowdloanRewards.completeInitialization(
          initBlock.toBigInt() + VESTING_PERIOD
        )
      )
      .signAndSend(sudoAccount);
    await context.createBlock();

    let issuance = (await context.axiaApi.query.balances.totalIssuance()) as any;

    let isInitialized = await context.axiaApi.query.crowdloanRewards.initialized();

    expect(isInitialized.toJSON()).to.be.true;

    // We should have burnt 1
    expect(issuance.toBigInt()).to.eq(BigInt(previousIssuance) - BigInt(1));
  });
});

describeDevAxtend("Crowdloan", (context) => {
  let genesisAccount: KeyringPair,
    sudoAccount: KeyringPair,
    relayAccount: KeyringPair,
    toAssociateAccount: KeyringPair;

  before("Setup genesis account and relay accounts", async () => {
    const keyring = new Keyring({ type: "ethereum" });
    const relayKeyRing = new Keyring({ type: "ed25519" });
    genesisAccount = await keyring.addFromUri(GENESIS_ACCOUNT_PRIVATE_KEY, null, "ethereum");
    sudoAccount = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
    const seed = randomAsHex(32);
    // add the account, override to ed25519
    relayAccount = await relayKeyRing.addFromUri(seed, null, "ed25519");
    toAssociateAccount = await keyring.addFromUri(seed, null, "ethereum");
  });

  it("should be able to associate identity", async function () {
    await context.axiaApi.tx.sudo
      .sudo(
        context.axiaApi.tx.crowdloanRewards.initializeRewardVec([
          [relayChainAddress, GENESIS_ACCOUNT, 1_500_000n * GLMR],
          [relayAccount.addressRaw, null, 1_500_000n * GLMR],
        ])
      )
      .signAndSend(sudoAccount);
    await context.createBlock();

    let initBlock = (await context.axiaApi.query.crowdloanRewards.initRelayBlock()) as any;

    // Complete initialization
    await context.axiaApi.tx.sudo
      .sudo(
        context.axiaApi.tx.crowdloanRewards.completeInitialization(
          initBlock.toBigInt() + VESTING_PERIOD
        )
      )
      .signAndSend(sudoAccount);
    await context.createBlock();

    let isInitialized = await context.axiaApi.query.crowdloanRewards.initialized();

    expect(isInitialized.toJSON()).to.be.true;

    // relayAccount should be in the unassociated contributions
    expect(
      (
        (await context.axiaApi.query.crowdloanRewards.unassociatedContributions(
          relayAccount.addressRaw
        )) as any
      )
        .unwrap()
        .totalReward.toBigInt()
    ).to.equal(1_500_000n * GLMR);

    // toAssociateAccount should not be in accounts payable
    expect(await getAccountPayable(context, toAssociateAccount.address)).to.be.null;

    let message = new Uint8Array([
      ...stringToU8a("<Bytes>"),
      ...stringToU8a("moonbase-"),
      ...toAssociateAccount.addressRaw,
      ...stringToU8a("</Bytes>"),
    ]);
    // Construct the signature
    let signature = {};
    signature["Ed25519"] = relayAccount.sign(message);

    // Associate the identity
    await context.axiaApi.tx.crowdloanRewards
      .associateNativeIdentity(toAssociateAccount.address, relayAccount.addressRaw, signature)
      .signAndSend(genesisAccount);
    await context.createBlock();

    // relayAccount should no longer be in the unassociated contributions
    expect(
      (
        await context.axiaApi.query.crowdloanRewards.unassociatedContributions(
          relayAccount.addressRaw
        )
      ).toJSON()
    ).to.be.null;

    // toAssociateAccount should now be in accounts payable
    let rewardInfo = await getAccountPayable(context, toAssociateAccount.address);

    expect(rewardInfo.totalReward.toBigInt()).to.equal(1_500_000n * GLMR);
    expect(rewardInfo.claimedReward.toBigInt()).to.equal(450_000n * GLMR);

    // three blocks elapsed
    let claimed = await calculate_vested_amount(
      context,
      rewardInfo.totalReward,
      rewardInfo.claimedReward,
      3
    );

    await context.axiaApi.tx.crowdloanRewards.claim().signAndSend(toAssociateAccount);

    await context.createBlock();

    // Claimed amount should match
    expect(
      (await getAccountPayable(context, toAssociateAccount.address)).claimedReward.toBigInt()
    ).to.equal(claimed);
  });
});

describeDevAxtend("Crowdloan", (context) => {
  let genesisAccount: KeyringPair,
    sudoAccount: KeyringPair,
    relayAccount: KeyringPair,
    relayAccount2: KeyringPair,
    firstAccount: KeyringPair,
    toAssociateAccount: KeyringPair;

  before("Setup genesis account and relay accounts", async () => {
    const keyring = new Keyring({ type: "ethereum" });
    const relayKeyRing = new Keyring({ type: "ed25519" });
    genesisAccount = await keyring.addFromUri(GENESIS_ACCOUNT_PRIVATE_KEY, null, "ethereum");
    sudoAccount = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
    const seed = randomAsHex(32);
    // add the account, override to ed25519
    relayAccount = await relayKeyRing.addFromUri(seed, null, "ed25519");
    const seed2 = randomAsHex(32);

    relayAccount2 = await relayKeyRing.addFromUri(seed2, null, "ed25519");

    firstAccount = await keyring.addFromUri(seed, null, "ethereum");

    toAssociateAccount = await keyring.addFromUri(seed2, null, "ethereum");
  });

  it("should be able to change reward address with relay keys", async function () {
    await context.axiaApi.tx.sudo
      .sudo(
        context.axiaApi.tx.crowdloanRewards.initializeRewardVec([
          [relayAccount.addressRaw, firstAccount.address, 1_500_000n * GLMR],
          [relayAccount2.addressRaw, firstAccount.address, 1_500_000n * GLMR],
        ])
      )
      .signAndSend(sudoAccount);
    await context.createBlock();

    let initBlock = (await context.axiaApi.query.crowdloanRewards.initRelayBlock()) as any;

    // Complete initialization
    await context.axiaApi.tx.sudo
      .sudo(
        context.axiaApi.tx.crowdloanRewards.completeInitialization(
          initBlock.toBigInt() + VESTING_PERIOD
        )
      )
      .signAndSend(sudoAccount);
    await context.createBlock();

    let isInitialized = await context.axiaApi.query.crowdloanRewards.initialized();

    expect(isInitialized.toJSON()).to.be.true;

    // toAssociateAccount should not be in accounts payable
    expect(await getAccountPayable(context, toAssociateAccount.address)).to.be.null;

    let message = new Uint8Array([
      ...stringToU8a("<Bytes>"),
      ...stringToU8a("moonbase-"),
      ...toAssociateAccount.addressRaw,
      ...firstAccount.addressRaw,
      ...stringToU8a("</Bytes>"),
    ]);

    // Construct the signatures
    let signature1 = {};
    signature1["Ed25519"] = relayAccount.sign(message);
    let signature2 = {};
    signature2["Ed25519"] = relayAccount2.sign(message);

    let proofs = [
      [relayAccount.addressRaw, signature1],
      [relayAccount2.addressRaw, signature2],
    ];
    // Associate the identity
    await context.axiaApi.tx.crowdloanRewards
      .changeAssociationWithRelayKeys(toAssociateAccount.address, firstAccount.address, proofs)
      .signAndSend(genesisAccount);
    await context.createBlock();

    // toAssociateAccount should now be in accounts payable
    let rewardInfo = await getAccountPayable(context, toAssociateAccount.address);

    expect(rewardInfo.totalReward.toBigInt()).to.equal(3_000_000n * GLMR);
  });
});

describeDevAxtend("Crowdloan", (context) => {
  let genesisAccount: KeyringPair, sudoAccount: KeyringPair, toUpdateAccount: KeyringPair;

  before("Setup genesis account and relay accounts", async () => {
    const keyring = new Keyring({ type: "ethereum" });
    genesisAccount = await keyring.addFromUri(GENESIS_ACCOUNT_PRIVATE_KEY, null, "ethereum");
    sudoAccount = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
    const seed = randomAsHex(32);
    toUpdateAccount = await keyring.addFromUri(seed, null, "ethereum");
  });

  it("should be able to update reward address", async function () {
    await context.axiaApi.tx.sudo
      .sudo(
        context.axiaApi.tx.crowdloanRewards.initializeRewardVec([
          [relayChainAddress, GENESIS_ACCOUNT, 3_000_000n * GLMR],
        ])
      )
      .signAndSend(sudoAccount);
    await context.createBlock();

    let initBlock = (await context.axiaApi.query.crowdloanRewards.initRelayBlock()) as any;

    // Complete initialization
    await context.axiaApi.tx.sudo
      .sudo(
        context.axiaApi.tx.crowdloanRewards.completeInitialization(
          initBlock.toBigInt() + VESTING_PERIOD
        )
      )
      .signAndSend(sudoAccount);
    await context.createBlock();

    let isInitialized = await context.axiaApi.query.crowdloanRewards.initialized();

    expect(isInitialized.toJSON()).to.be.true;

    // GENESIS_ACCOUNT should be in accounts pauable
    let rewardInfo = await getAccountPayable(context, GENESIS_ACCOUNT);

    expect(rewardInfo.totalReward.toBigInt()).to.equal(3_000_000n * GLMR);

    expect(rewardInfo.claimedReward.toBigInt()).to.equal(900_000n * GLMR);

    // three blocks elapsed
    let claimed = await calculate_vested_amount(
      context,
      rewardInfo.totalReward,
      rewardInfo.claimedReward,
      2
    );

    await context.axiaApi.tx.crowdloanRewards.claim().signAndSend(genesisAccount);

    await context.createBlock();

    // Claimed amount should match
    const claimedRewards = (await getAccountPayable(context, GENESIS_ACCOUNT)).claimedReward;

    expect(claimedRewards.toBigInt()).to.equal(claimed);

    // Let's update the reward address
    await context.axiaApi.tx.crowdloanRewards
      .updateRewardAddress(toUpdateAccount.address)
      .signAndSend(genesisAccount);
    await context.createBlock();

    // GENESIS_ACCOUNT should no longer be in accounts payable
    expect(await getAccountPayable(context, GENESIS_ACCOUNT)).to.be.null;

    // toUpdateAccount should be in accounts paYable
    rewardInfo = await getAccountPayable(context, toUpdateAccount.address);

    expect(rewardInfo.totalReward.toBigInt()).to.equal(3_000_000n * GLMR);

    expect(rewardInfo.claimedReward.toBigInt()).to.equal(claimed);
  });
});

describeDevAxtend("Crowdloan", (context) => {
  let genesisAccount: KeyringPair,
    sudoAccount: KeyringPair,
    toUpdateAccount: KeyringPair,
    proxy: KeyringPair;

  before("Setup genesis account and relay accounts", async () => {
    const keyring = new Keyring({ type: "ethereum" });
    genesisAccount = await keyring.addFromUri(GENESIS_ACCOUNT_PRIVATE_KEY, null, "ethereum");
    sudoAccount = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
    proxy = keyring.addFromUri(BALTATHAR_PRIVATE_KEY, null, "ethereum");
    const seed = randomAsHex(32);
    toUpdateAccount = await keyring.addFromUri(seed, null, "ethereum");
  });

  it("should be able to call crowdloan rewards with non-transfer proxy", async function () {
    await context.axiaApi.tx.sudo
      .sudo(
        context.axiaApi.tx.crowdloanRewards.initializeRewardVec([
          [relayChainAddress, GENESIS_ACCOUNT, 3_000_000n * GLMR],
        ])
      )
      .signAndSend(sudoAccount);
    await context.createBlock();

    let initBlock = (await context.axiaApi.query.crowdloanRewards.initRelayBlock()) as any;

    // Complete initialization
    await context.axiaApi.tx.sudo
      .sudo(
        context.axiaApi.tx.crowdloanRewards.completeInitialization(
          initBlock.toBigInt() + VESTING_PERIOD
        )
      )
      .signAndSend(sudoAccount);
    await context.createBlock();

    let isInitialized = await context.axiaApi.query.crowdloanRewards.initialized();

    expect(isInitialized.toJSON()).to.be.true;

    // GENESIS_ACCOUNT should be in accounts pauable
    let rewardInfo = await getAccountPayable(context, GENESIS_ACCOUNT);

    expect(rewardInfo.totalReward.toBigInt()).to.equal(3_000_000n * GLMR);

    expect(rewardInfo.claimedReward.toBigInt()).to.equal(900_000n * GLMR);

    // CreateProxy
    await context.axiaApi.tx.proxy
      .addProxy(proxy.address, "NonTransfer", 0)
      .signAndSend(genesisAccount);
    await context.createBlock();

    // three blocks elapsed
    let claimed = await calculate_vested_amount(
      context,
      rewardInfo.totalReward,
      rewardInfo.claimedReward,
      3
    );

    // Claim with proxy
    await context.axiaApi.tx.proxy
      .proxy(genesisAccount.address, null, context.axiaApi.tx.crowdloanRewards.claim())
      .signAndSend(proxy);

    await context.createBlock();

    // Claimed amount should match
    const claimedRewards = (await getAccountPayable(context, GENESIS_ACCOUNT)).claimedReward;

    expect(claimedRewards.toBigInt()).to.equal(claimed);
  });
});

describeDevAxtend("Crowdloan", (context) => {
  let genesisAccount: KeyringPair,
    sudoAccount: KeyringPair,
    toUpdateAccount: KeyringPair,
    proxy: KeyringPair;

  before("Setup genesis account and relay accounts", async () => {
    const keyring = new Keyring({ type: "ethereum" });
    genesisAccount = await keyring.addFromUri(GENESIS_ACCOUNT_PRIVATE_KEY, null, "ethereum");
    sudoAccount = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
    proxy = keyring.addFromUri(BALTATHAR_PRIVATE_KEY, null, "ethereum");
    const seed = randomAsHex(32);
    toUpdateAccount = await keyring.addFromUri(seed, null, "ethereum");
  });

  it("should NOT be able to call non-claim extrinsic with non-transfer proxy", async function () {
    await context.axiaApi.tx.sudo
      .sudo(
        context.axiaApi.tx.crowdloanRewards.initializeRewardVec([
          [relayChainAddress, GENESIS_ACCOUNT, 3_000_000n * GLMR],
        ])
      )
      .signAndSend(sudoAccount);
    await context.createBlock();

    let initBlock = (await context.axiaApi.query.crowdloanRewards.initRelayBlock()) as any;

    // Complete initialization
    await context.axiaApi.tx.sudo
      .sudo(
        context.axiaApi.tx.crowdloanRewards.completeInitialization(
          initBlock.toBigInt() + VESTING_PERIOD
        )
      )
      .signAndSend(sudoAccount);
    await context.createBlock();

    let isInitialized = await context.axiaApi.query.crowdloanRewards.initialized();

    expect(isInitialized.toJSON()).to.be.true;

    // GENESIS_ACCOUNT should be in accounts pauable
    let rewardInfo = await getAccountPayable(context, GENESIS_ACCOUNT);

    expect(rewardInfo.totalReward.toBigInt()).to.equal(3_000_000n * GLMR);

    expect(rewardInfo.claimedReward.toBigInt()).to.equal(900_000n * GLMR);

    // CreateProxy
    await context.axiaApi.tx.proxy
      .addProxy(proxy.address, "NonTransfer", 0)
      .signAndSend(genesisAccount);
    await context.createBlock();

    // Should not be ablte to do this
    let { events } = await createBlockWithExtrinsic(
      context,
      proxy,
      context.axiaApi.tx.proxy.proxy(
        genesisAccount.address,
        null,
        context.axiaApi.tx.crowdloanRewards.updateRewardAddress(proxy.address)
      )
    );
    expect(events[1].toHuman().method).to.eq("ProxyExecuted");
    expect(events[1].data[0].toString()).to.be.eq(`{"err":{"module":{"index":0,"error":5}}}`);

    // Genesis account still has the money
    rewardInfo = await getAccountPayable(context, GENESIS_ACCOUNT);

    expect(rewardInfo.totalReward.toBigInt()).to.equal(3_000_000n * GLMR);

    expect(rewardInfo.claimedReward.toBigInt()).to.equal(900_000n * GLMR);
  });
});
