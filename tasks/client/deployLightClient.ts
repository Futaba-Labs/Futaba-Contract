import { task } from "hardhat/config";

task("TASK_DEPLOY_LIGHT_CLIENT", "Deploys the light client contract")
  .setAction(
    async (taskArgs, hre): Promise<string> => {
      const LigthClient = await hre.ethers.getContractFactory("LightClientMock");
      const client = await LigthClient.deploy();
      await client.deployed();
      console.log(`LigthClient deployed to: `, client.address);

      await new Promise(f => setTimeout(f, 10000))

      // await hre.run("TASK_VERIFY", {
      //   address: client.address
      // });

      return client.address;
    }
  );
