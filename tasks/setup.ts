import { task, types } from "hardhat/config";
import DEPLOYMENT from "../constants/deployments.json"

task("TASK_SETUP", "Setup all contract")
  .setAction(
    async (taskArgs, hre): Promise<null> => {
      // const gateway = await hre.run("TASK_DEPLOY_GATEWAY")

      const client = await hre.run("TASK_DEPLOY_LIGHT_CLIENT")

      // const oracle = await hre.run("TASK_DEPLOY_ORACLE")
      const oracle = "0x4BFf081728E6B97DCC8035Ce5c555a272d57Ed12"

      // await hre.run("TASK_SET_LIGHT_CLIENT", { oracle, client })
      await hre.run("TASK_SET_ORACLE", { oracle, client })

      await hre.run("TASK_SET_BASE_INFO", { oracle, client, subid: 430, url: "https://sepolia.infura.io/v3/d55caa9f87974a1995daf46a5b815925" })

      const operator = DEPLOYMENT.operator[hre.network.config.chainId?.toString() as keyof typeof DEPLOYMENT.operator]

      // await hre.run("TASK_SET_CHAINLINK_ORACLE", { oracle, operator })
      return null;
    }
  );
