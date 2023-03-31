import { task, types } from "hardhat/config";
import fs from "fs";

task("TASK_SET_BASE_INFO", "set base information contract address on Light Client contract")
  .addParam<string>("oracle", "the oracle contract address", "", types.string)
  .addParam<string>("client", "the light client contract address", "", types.string)
  .addParam<number>("subid", "the light client contract address", 0, types.int)
  .addParam<string>("url", "the light client contract address", "", types.string)
  .setAction(
    async (taskArgs, hre): Promise<null> => {
      const client = await hre.ethers.getContractAt("LightClientMock", taskArgs.client);

      const oracle = taskArgs.oracle
      const subid = taskArgs.subid
      const url = taskArgs.url
      const source = fs.readFileSync("./Functions-request-source.js").toString()

      try {
        let tx = await (await client.setSubscriptionId(subid, { gasLimit: 2000000 })).wait()
        console.log(`✅ [${hre.network.name}] setSubscriptionId(${subid})`)
        console.log(` tx: ${tx.transactionHash}`)

        tx = await (await client.setProviderURL(11155111, url, { gasLimit: 2000000 })).wait()
        console.log(`✅ [${hre.network.name}] setProviderURL(11155111, ${url})`)
        console.log(` tx: ${tx.transactionHash}`)

        tx = await (await client.setSource(source, { gasLimit: 2000000 })).wait()
        console.log(`✅ [${hre.network.name}] setSource(${source})`)
        console.log(` tx: ${tx.transactionHash}`)

      } catch (e: any) {
        if (e.error.message.includes("The chainId + address is already trusted")) {
          console.log("*source already set*")
        } else {
          console.log(e)
          console.log(`❌ [${hre.network.name}] setOracle(${oracle})`)
        }
      }

      return null;
    }
  );
