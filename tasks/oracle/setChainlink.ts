import { task, types } from "hardhat/config";

task("TASK_SET_CHAINLINK_ORACLE", "set chainlink oracle contract address")
  .addParam<string>("oracle", "oracle contract address", "", types.string)
  .addParam<string>("operator", "operator contract address", "", types.string)
  .setAction(
    async (taskArgs, hre): Promise<null> => {
      const oracle = await hre.ethers.getContractAt("OracleMock", taskArgs.oracle);

      const chainlinkNode = taskArgs.operator

      try {
        let tx = await (await oracle.setOracle(chainlinkNode, { gasLimit: 2000000 })).wait()
        console.log(`✅ [${hre.network.name}] setOracle(${chainlinkNode}`)
        console.log(` tx: ${tx.transactionHash}`)

      } catch (e: any) {
        console.log(e)
        if (e.error.message.includes("The chainId + address is already trusted")) {
          console.log("*source already set*")
        } else {
          console.log(e)
          console.log(`❌ [${hre.network.name}] setOracle(${chainlinkNode}`)
        }
      }

      console.log("\n")

      return null;
    }
  );
