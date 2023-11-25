import { task, types } from "hardhat/config";
import DEPLOYMENT from "../constants/deployments.json"
import ORACLE from "../constants/oracle.json"
import fs from 'fs';
import { parseEther } from "ethers/lib/utils";
import { BigNumber } from "ethers/lib/ethers";

const FILE_PATH = "./constants/deployments.json"
const protocolFee = "0.001";
const gasData = {
  gasLimit: "1000000",
  gasPrice: "10000000000", // 10 gwei
  gasPerQuery: "21000"
}

task("TASK_SETUP_CONTRACT", "Setup all contract")
  .addParam<boolean>("gateway", "Deploy gateway contract", false, types.boolean)
  .addParam<boolean>("oracle", "Deploy oracle contract", false, types.boolean)
  .addParam<boolean>("client", "Deploy ligth client contract", false, types.boolean)
  .addParam<boolean>("operator", "Deploy operator contract", false, types.boolean)
  .setAction(
    async (taskArgs, hre): Promise<null> => {

      await hre.run("compile");

      console.log("Setting up contract...");

      let gateway: any, oracle: any, client: any, operator: any, deployments: any;

      const isGatewayDepolyed = taskArgs.gateway, isOracleDepolyed = taskArgs.oracle, isClientDepolyed = taskArgs.client, isOperatorDepolyed = taskArgs.operator;

      // Read deployments.json
      const data = await fs.promises.readFile(FILE_PATH, 'utf8');
      deployments = JSON.parse(data.toString());

      if (isGatewayDepolyed) {
        gateway = await hre.run("TASK_DEPLOY_GATEWAY", { fee: protocolFee, verify: false })
      } else {
        gateway = deployments[hre.network.name as keyof typeof DEPLOYMENT].gateway;
        console.log("Already deployed Gateway Contract:", gateway)
      }

      if (isClientDepolyed) {
        const feed = ORACLE[hre.network.name as keyof typeof ORACLE].feed;
        client = await hre.run("TASK_DEPLOY_LIGHT_CLIENT", { gateway, oracle: gateway, feed, gaslimit: gasData.gasLimit, gasprice: gasData.gasPrice, gasperquery: gasData.gasPerQuery, verify: false })
      } else {
        client = deployments[hre.network.name as keyof typeof DEPLOYMENT]["light_client"];
        console.log("Already deployed LightClient Contract:", client)
      }

      if (isOperatorDepolyed) {
        operator = await hre.run("TASK_DEPLOY_OPERATOR", { verify: false })
      } else {
        operator = deployments[hre.network.name as keyof typeof DEPLOYMENT].operator;
        console.log("Already deployed Operator Contract:", operator)
      }

      if (isOracleDepolyed) {
        oracle = await hre.run("TASK_DEPLOY_ORACLE", { verify: false, client, operator })
      } else {
        oracle = deployments[hre.network.name as keyof typeof DEPLOYMENT].oracle;
        console.log("Already deployed Oracle Contract:", oracle)
      }


      if (isClientDepolyed || isOracleDepolyed) {
        await hre.run("TASK_SET_ORACLE", { oracle, client })
      }

      if (isOperatorDepolyed || isOracleDepolyed) {
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
