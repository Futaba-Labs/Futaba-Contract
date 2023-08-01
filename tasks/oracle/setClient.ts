import { task, types } from "hardhat/config";

task("TASK_SET_LIGHT_CLIENT", "set oracle contract address")
  .addParam<string>("client", "the light client contract address", "", types.string)
  .addParam<string>("oracle", "the gateway contract address", "", types.string)
  .setAction(
    async (taskArgs, hre): Promise<null> => {
      const oracle = await hre.ethers.getContractAt("ChainlinkOracle", taskArgs.oracle);

      const client = taskArgs.client
      try {
        console.log(`setting client to ${client}...`)
        let tx = await (await oracle.setClient(client, { gasLimit: 2000000 })).wait()
        console.log(`✅ [${hre.network.name}] setClient(${client})`)
        console.log(` tx: ${tx.transactionHash}`)

      } catch (e: any) {
        if (e.error.message.includes("The chainId + address is already trusted")) {
          console.log("*source already set*")
        } else {
          console.log(e)
          console.log(`❌ [${hre.network.name}] setClient(${client})`)
        }
      }
      return null;
    }
  );