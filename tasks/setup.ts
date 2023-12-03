import { task, types } from "hardhat/config";
import DEPLOYMENT from "../constants/deployments.json"
import ORACLE from "../constants/oracle.json"
import fs from 'fs';

const FILE_PATH = "./constants/deployments.json"

task("TASK_SETUP_CONTRACT", "Setup all contract")
  .addParam<boolean>("gateway", "Deploy gateway contract", false, types.boolean)
  .addParam<boolean>("oracle", "Deploy oracle contract", false, types.boolean)
  .addParam<boolean>("client", "Deploy light client contract", false, types.boolean)
  .addParam<boolean>("operator", "Deploy operator contract", false, types.boolean)
  .setAction(
    async (taskArgs, hre): Promise<null> => {

      await hre.run("compile");

      console.log("Setting up contract...");

      let gateway: any, oracle: any, client: any, operator: any, deployments: any;

      const isGatewayDeployed = taskArgs.gateway, isOracleDeployed = taskArgs.oracle, isClientDeployed = taskArgs.client, isOperatorDeployed = taskArgs.operator;

      // Read deployments.json
      const data = await fs.promises.readFile(FILE_PATH, 'utf8');
      deployments = JSON.parse(data.toString());

      if (isGatewayDeployed) {
        gateway = await hre.run("TASK_DEPLOY_GATEWAY", { verify: false })
      } else {
        gateway = deployments[hre.network.name as keyof typeof DEPLOYMENT].gateway;
        console.log("Already deployed Gateway Contract:", gateway)
      }

      if (isClientDeployed) {
        client = await hre.run("TASK_DEPLOY_LIGHT_CLIENT", { gateway, oracle: gateway, verify: false })
      } else {
        client = deployments[hre.network.name as keyof typeof DEPLOYMENT]["light_client"];
        console.log("Already deployed LightClient Contract:", client)
      }

      if (isOperatorDeployed) {
        operator = await hre.run("TASK_DEPLOY_OPERATOR", { verify: false })
      } else {
        operator = deployments[hre.network.name as keyof typeof DEPLOYMENT].operator;
        console.log("Already deployed Operator Contract:", operator)
      }

      if (isOracleDeployed) {
        oracle = await hre.run("TASK_DEPLOY_ORACLE", { verify: false, client, operator })
      } else {
        oracle = deployments[hre.network.name as keyof typeof DEPLOYMENT].oracle;
        console.log("Already deployed Oracle Contract:", oracle)
      }


      if (isClientDeployed || isOracleDeployed) {
        await hre.run("TASK_SET_ORACLE", { oracle, client })
      }

      if (isOperatorDeployed || isOracleDeployed) {
        await hre.run("TASK_SET_CHAINLINK_ORACLE", { oracle, operator })
        await hre.run("TASK_SET_SENDER", { operator, oracle })
      }

      deployments[hre.network.name].gateway = gateway;
      deployments[hre.network.name].light_client = client;
      deployments[hre.network.name].oracle = oracle;
      deployments[hre.network.name].operator = operator;

      // Write deployments.json
      fs.writeFileSync(FILE_PATH, JSON.stringify(deployments))

      console.log("Contract setup is complete.");
      return null;
    }
  );
