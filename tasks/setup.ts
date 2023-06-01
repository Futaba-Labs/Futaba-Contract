import { task, types } from "hardhat/config";
import DEPLOYMENT from "../constants/deployments.json"
import ORACLE from "../constants/oracle.json"
import fs from 'fs';

const FILE_PATH = "./constants/deployments.json"

task("TASK_SETUP_CONTRACT", "Setup all contract")
  .addParam<boolean>("gateway", "Deploy gateway contract", false, types.boolean)
  .addParam<boolean>("oracle", "Deploy oracle contract", false, types.boolean)
  .addParam<boolean>("client", "Deploy ligth client contract", false, types.boolean)
  .setAction(
    async (taskArgs, hre): Promise<null> => {

      await hre.run("compile");

      console.log("Setting up contract...");

      let gateway: any, oracle: any, client: any, deployments: any;

      const isGatewayDepolyed = taskArgs.gateway, isOracleDepolyed = taskArgs.oracle, isClientDepolyed = taskArgs.client;

      const data = await fs.promises.readFile(FILE_PATH, 'utf8');
      deployments = JSON.parse(data.toString());

      if (isGatewayDepolyed) {
        gateway = await hre.run("TASK_DEPLOY_GATEWAY", { verify: false })
      } else {
        gateway = deployments[hre.network.name as keyof typeof DEPLOYMENT].gateway;
        console.log("Already deployed Gateway Contract:", gateway)
      }

      if (isClientDepolyed) {
        client = await hre.run("TASK_DEPLOY_LIGHT_CLIENT", { verify: false })
      } else {
        client = deployments[hre.network.name as keyof typeof DEPLOYMENT]["light_client"];
        console.log("Already deployed LightClient Contract:", client)
      }

      if (isOracleDepolyed) {
        oracle = await hre.run("TASK_DEPLOY_ORACLE", { verify: false, client })
      } else {
        oracle = deployments[hre.network.name as keyof typeof DEPLOYMENT].oracle;
        console.log("Already deployed Oracle Contract:", oracle)
      }

      if (isClientDepolyed || isOracleDepolyed) {
        const operator = ORACLE[hre.network.name as keyof typeof ORACLE].operator;
        await hre.run("TASK_SET_CHAINLINK_ORACLE", { oracle, operator })
        await hre.run("TASK_SET_ORACLE", { oracle, client })
        await hre.run("TASK_SET_SENDER", { operator })
      }

      deployments[hre.network.name].gateway = gateway;
      deployments[hre.network.name].light_client = client;
      deployments[hre.network.name].oracle = oracle;

      fs.writeFileSync(FILE_PATH, JSON.stringify(deployments))

      console.log("Contract setup is complete.");
      return null;
    }
  );
