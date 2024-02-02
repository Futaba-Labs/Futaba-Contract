import { task, types } from "hardhat/config";

task("TASK_SET_RELAYER", "set relayer in gatwaey contract")
  .addParam<string>("gateway", "gateway contract address", "", types.string)
  .addVariadicPositionalParam("relayers", "relayer addresses", [])
  .setAction(
    async (taskArgs, hre): Promise<null> => {
      const gatewayAddress = taskArgs.gateway,
        relayers = taskArgs.relayers
      if (!gatewayAddress || relayers.length === 0) throw new Error("gateway address and relayers are required");

      const gateway = await hre.ethers.getContractAt("Gateway", gatewayAddress);

      try {
        console.log(`setting gateway to ${relayers}...`)
        let tx = await (await gateway.setRelayers(relayers, { gasLimit: 2000000 })).wait()
        console.log(`✅ [${hre.network.name}] setRelayers(${relayers}`)
        console.log(` tx: ${tx.transactionHash}`)

      } catch (e: any) {
        console.log(e)
        if (e.error.message.includes("The chainId + address is already trusted")) {
          console.log("*source already set*")
        } else {
          console.log(e)
          console.log(`❌ [${hre.network.name}] setRelayers(${relayers}`)
        }
      }

      console.log("\n")

      return null;
    }
  );
