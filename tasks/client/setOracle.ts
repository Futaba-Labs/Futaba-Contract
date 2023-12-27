import { task, types } from "hardhat/config";

task("TASK_SET_ORACLE", "set oracle contract address on Light Client contract")
  .addParam<string>("oracle", "the oracle contract address", "", types.string)
  .addParam<string>("client", "the light client contract address", "", types.string)
  .setAction(
    async (taskArgs, hre): Promise<null> => {
      const client = await hre.ethers.getContractAt("ChainlinkLightClient", taskArgs.client);

      const oracle = taskArgs.oracle
      try {
        console.log(`setting oracle to ${oracle}...`)
        let tx = await (await client.setOracle(oracle, { gasLimit: 2000000 })).wait()
        console.log(`✅ [${hre.network.name}] setOracle(${oracle})`)
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
