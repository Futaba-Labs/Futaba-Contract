import { task, types } from "hardhat/config";
import DEPLOYMENT from "../constants/deployments.json"
import fs from 'fs';

const FILE_PATH = "./constants/deployments.json"

task("TASK_SETUP_CONTRACT", "Setup all contract")
  .addParam<boolean>("gateway", "Deploy gateway contract", false, types.boolean)
  .addParam<boolean>("oracle", "Deploy oracle contract", false, types.boolean)
  .addParam<boolean>("client", "Deploy ligth client contract", false, types.boolean)
  .setAction(
    async (taskArgs, hre): Promise<null> => {
      let gateway: any, oracle: any, client: any, deployments: any;
      if (!taskArgs.gateway || !taskArgs.oracle || !taskArgs.client) {
        const data = await fs.promises.readFile(FILE_PATH, 'utf8');
        deployments = JSON.parse(data.toString());
      }
      if (taskArgs.gateway) {
        gateway = await hre.run("TASK_DEPLOY_GATEWAY", { verify: false })
      } else {
        gateway = deployments[hre.network.name as keyof typeof DEPLOYMENT].gateway;
        console.log("Gateway Contract:", gateway)
      }

      if (taskArgs.client) {
        client = await hre.run("TASK_DEPLOY_LIGHT_CLIENT", { verify: false })
      } else {
        client = deployments[hre.network.name as keyof typeof DEPLOYMENT]["light_client"];
        console.log("LightClient Contract:", gateway)
      }

      if (taskArgs.oracle) {
        oracle = await hre.run("TASK_DEPLOY_ORACLE", { verify: false })
      } else {
        oracle = deployments[hre.network.name as keyof typeof DEPLOYMENT].oracle;
        console.log("Oracle Contract:", oracle)
      }

      const operator = deployments[hre.network.name as keyof typeof DEPLOYMENT].operator;
      console.log("Operator Contract:", operator)
      await hre.run("TASK_SET_CHAINLINK_ORACLE", { oracle, operator })
      await hre.run("TASK_SET_ORACLE", { oracle, client })
      await hre.run("TASK_SET_LIGHT_CLIENT", { oracle, client })

      deployments[hre.network.name].gateway = gateway;
      deployments[hre.network.name].light_client = client;
      deployments[hre.network.name].oracle = oracle;

      fs.writeFileSync(FILE_PATH, JSON.stringify(deployments))

      console.log("Contract setup is complete.");
      return null;
    }
  );
