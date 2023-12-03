import { task, types } from "hardhat/config";

task("TASK_DEPLOY_LIGHT_CLIENT", "Deploys the light client contract")
  .addParam<string>("gateway", "Gateway contract address", "", types.string)
  .addParam<string>("oracle", "Oracle contract address", "", types.string)
  .addParam<boolean>("verify", "Verify gateway contract", false, types.boolean)
  .setAction(
    async (taskArgs, hre): Promise<string> => {
      const LightClient = await hre.ethers.getContractFactory("ChainlinkLightClient");
      const gateway = taskArgs.gateway,
        oracle = taskArgs.oracle
      if (!gateway || !oracle) {
        throw new Error("Contract address is required");
      }

      console.log(`Deploying light client...`);
      const client = await LightClient.deploy(gateway, oracle);
      await client.deployed();
      console.log(`LightClient deployed to: `, client.address);
      if (taskArgs.verify) {
        await hre.run("TASK_VERIFY", {
          address: client.address
        });
      }
      await new Promise(f => setTimeout(f, 10000))
      return client.address;
    }
  );
