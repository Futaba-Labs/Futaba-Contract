import { task, types } from "hardhat/config";
import DEPLOYMENT from "../constants/deployments.json"

task("TASK_SETUP", "Setup all contract")
  .setAction(
    async (taskArgs, hre): Promise<null> => {
      const gateway = await hre.run("TASK_DEPLOY_GATEWAY")

      const client = await hre.run("TASK_DEPLOY_LIGHT_CLIENT")

      const oracle = await hre.run("TASK_DEPLOY_ORACLE")

      await hre.run("TASK_SET_LIGHT_CLIENT", { oracle, client })
      await hre.run("TASK_SET_ORACLE", { oracle, client })

      const operator = DEPLOYMENT.operator[hre.network.config.chainId?.toString() as keyof typeof DEPLOYMENT.operator]

      await hre.run("TASK_SET_CHAINLINK_ORACLE", { oracle, operator })
      return null;
    }
  );
