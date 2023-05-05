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
      let gateway: any, oracle: any, client: any;
      if (taskArgs.gateway) {
        gateway = await hre.run("TASK_DEPLOY_GATEWAY", { verify: false })
      } else {
        fs.readFile(FILE_PATH, (err, data) => {
          if (err) throw err;

          const deployments = JSON.parse(data.toString());
          gateway = deployments[hre.network.name as keyof typeof DEPLOYMENT].gateway;
          console.log("gateway", gateway)

        });
      }

      if (taskArgs.client) {
        client = await hre.run("TASK_DEPLOY_LIGHT_CLIENT", { verify: false })
      } else {
        fs.readFile(FILE_PATH, (err, data) => {
          if (err) throw err;

          const deployments = JSON.parse(data.toString());
          client = deployments[hre.network.name as keyof typeof DEPLOYMENT].client;
        });
      }

      if (taskArgs.oracle) {
        oracle = await hre.run("TASK_DEPLOY_ORACLE", { verify: false })
      } else {
        fs.readFile(FILE_PATH, (err, data) => {
          if (err) throw err;

          const deployments = JSON.parse(data.toString());
          oracle = deployments[hre.network.name as keyof typeof DEPLOYMENT].oracle;
        });
      }

      const operator = DEPLOYMENT[hre.network.name as keyof typeof DEPLOYMENT].operator;
      await hre.run("TASK_SET_CHAINLINK_ORACLE", { oracle, operator })
      await hre.run("TASK_SET_ORACLE", { oracle, client })
      await hre.run("TASK_SET_LIGHT_CLIENT", { oracle, client })

      const deployments = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8').toString())
      deployments[hre.network.name].gateway = gateway;
      deployments[hre.network.name].light_client = client;
      deployments[hre.network.name].oracle = oracle;

      fs.writeFileSync(FILE_PATH, JSON.stringify(deployments))

      console.log("Contract setup is complete.");
      return null;
    }
  );
