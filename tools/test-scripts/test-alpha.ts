import { ApiPromise, WsProvider } from "@axia/api";
import Web3 from "web3";
import { typesBundlePre900 } from "../../axtend-types-bundle/dist";
import { FAITH } from "../test-constants";
const wsProviderUrl = `wss://wss.testnet.axtend.network`;

export default async function test(ACC: string) {
  const web3 = new Web3(wsProviderUrl);
  let balance = await web3.eth.getBalance(ACC);
  console.log("BALANCE WEB3", balance.toString());

  const wsProvider = new WsProvider(wsProviderUrl);
  const axiaApi = await ApiPromise.create({
    provider: wsProvider,
    typesBundle: typesBundlePre900 as any,
  });
  const account = await axiaApi.query.system.account(ACC);
  // console.log("BALANCE API", account.data.feeFrozen.toString());
  // console.log("BALANCE API", account.data.miscFrozen.toString());
  // console.log("BALANCE API", account.data.reserved.toString());
  console.log("BALANCE API", account.data.free.toString());

  const block = await web3.eth.getBlock("latest");
  console.log("block", block);
}
test(FAITH);
