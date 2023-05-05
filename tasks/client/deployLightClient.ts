import { task, types } from "hardhat/config";

task("TASK_DEPLOY_LIGHT_CLIENT", "Deploys the light client contract")
  .addParam<boolean>("verify", "Verify gateway contract", false, types.boolean)
  .setAction(
    async (taskArgs, hre): Promise<string> => {
      const LigthClient = await hre.ethers.getContractFactory("ChainlinkMock");
      const client = await LigthClient.deploy();
      await client.deployed();
      console.log(`LigthClient deployed to: `, client.address);
      console.log("\n")

      if (taskArgs.verify) {
        await hre.run("TASK_VERIFY", {
          address: client.address
        });
      }
      await new Promise(f => setTimeout(f, 10000))
      return client.address;
    }
  );
