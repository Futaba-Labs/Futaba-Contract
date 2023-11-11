import { task, types } from "hardhat/config";
import ORACLE from "../../constants/oracle.json"

task("TASK_SET_SENDER", "set sender wallet address")
  .addParam<string>("operator", "the operator contract address", "", types.string)
  .addParam<string>("oracle", "the oracle contract address", "", types.string)
  .setAction(
    async (taskArgs, hre): Promise<null> => {
      const oracleConfig = ORACLE[hre.network.name as keyof typeof ORACLE]

      const operator = await hre.ethers.getContractAt("Operator", taskArgs.operator);
      const sender = oracleConfig.sender;

      try {
        console.log(`setting operator to ${sender}...`)
        let tx = await (await operator.setAuthorizedSenders([sender], { gasLimit: 2000000 })).wait()
        console.log(`✅ [${hre.network.name}] setAuthorizedSenders(${[sender]})`)
        console.log(` tx: ${tx.transactionHash}`)

      } catch (e: any) {
        if (e.error.message.includes("The chainId + address is already trusted")) {
          console.log("*source already set*")
        } else {
          console.log(e)
          console.log(`❌ [${hre.network.name}] setAuthorizedSenders(${[sender]})`)
        }
      }
      return null;
    }
  );