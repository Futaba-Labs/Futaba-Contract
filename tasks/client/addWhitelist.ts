import { task, types } from "hardhat/config";

task("TASK_ADD_WHITELIST", "add whitelist")
  .addParam<string>("client", "the light client contract address", "", types.string)
  .addVariadicPositionalParam("addresses")
  .setAction(
    async (taskArgs, hre): Promise<null> => {
      const client = taskArgs.client
      const addresses = taskArgs.addresses

      try {
        console.log(`setting addresses to ${addresses}...`)
        let tx = await (await client.addToWhitelist(addresses, { gasLimit: 2000000 })).wait()
        console.log(`✅ [${hre.network.name}] addToWhitelist(${addresses})`)
        console.log(` tx: ${tx.transactionHash}`)

      } catch (e: any) {
        if (e.error.message.includes("The chainId + address is already trusted")) {
          console.log("*source already set*")
        } else {
          console.log(e)
          console.log(`❌ [${hre.network.name}] addToWhitelist(${addresses})`)
        }
      }
      return null
    })
