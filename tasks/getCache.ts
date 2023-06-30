import { task, types } from "hardhat/config";
import DEPLOYMENTS from "../constants/deployments.json"
import { QueryType } from "../typechain-types/contracts/Gateway";

task("TASK_GET_CACHE", "get cache")
  .addParam<number>("chainid", "destination chain id", 0, types.int)
  .addParam<number>("height", "block height", 0, types.int)
  .addParam<string>("to", "target contract address", "", types.string)
  .addParam<string>("slot", "storage slot", "", types.string)
  .setAction(
    async (taskArgs, hre): Promise<null> => {
      const gatewayAddr = DEPLOYMENTS[hre.network.name as keyof typeof DEPLOYMENTS].gateway;
      const gateway = await hre.ethers.getContractAt("Gateway", gatewayAddr);

      const query: QueryType.QueryRequestStruct[] = [{
        dstChainId: taskArgs.chainid,
        height: taskArgs.height,
        to: taskArgs.to,
        slot: taskArgs.slot
      }]
      try {
        const result = await gateway.getCache(query)
        console.log(`✅ [${hre.network.name}] getCache(${query})`)
        console.log(` result: ${result}`)

      } catch (e: any) {
        if (e.error.message.includes("The chainId + address is already trusted")) {
          console.log("*source already set*")
        } else {
          console.log(e)
          console.log(`❌ [${hre.network.name}] getCache(${query})`)
        }
      }
      return null;
    }
  );
