import { task, types } from "hardhat/config";

task("TASK_SET_ORACLE", "set light client contract address on Oracle contract")
  .addParam<string>("oracle", "the oracle contract address", "", types.string)
  .addParam<string>("client", "the light client contract address", "", types.string)
  .setAction(
    async (taskArgs, hre): Promise<null> => {
      const gateway = await hre.ethers.getContractAt("OracleMock", taskArgs.oracle);

      const client = taskArgs.client
      try {
        let tx = await (await gateway.setClient(client, { gasLimit: 2000000 })).wait()
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
