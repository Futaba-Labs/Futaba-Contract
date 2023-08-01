import { task, types } from "hardhat/config";

task("TASK_ADD_WHITELIST", "add whitelist")
  .addParam<string>("client", "the light client contract address", "", types.string)
  .addVariadicPositionalParam("addresses")
  .setAction(
    async (taskArgs, hre): Promise<null> => {
      const chainlinkMock = await hre.ethers.getContractAt("ChainlinkLightClient", taskArgs.client);
      const addresses = taskArgs.addresses

      try {
        console.log(`setting addresses to ${[addresses]}`)
        const tx = await chainlinkMock.addToWhitelist(addresses, { gasLimit: 10000000 })
        const receiptTx = await tx.wait()
        console.log(`✅ [${hre.network.name}] addToWhitelist(${addresses})`)
        console.log(` tx: ${receiptTx.transactionHash}`)

      } catch (e: any) {
        console.log(e)
        if (e.error.message.includes("The chainId + address is already trusted")) {
          console.log("*source already set*")
        } else {
          console.log(`❌ [${hre.network.name}] addToWhitelist(${addresses})`)
        }
      }
      return null
    })
