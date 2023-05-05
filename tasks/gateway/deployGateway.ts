import { task, types } from "hardhat/config";

task("TASK_DEPLOY_GATEWAY", "Deploy gateway and oracle contract")
  .addParam<boolean>("verify", "Verify gateway contract", false, types.boolean)
  .setAction(
    async (taskArgs, hre): Promise<string> => {
      const Gateway = await hre.ethers.getContractFactory("Gateway");

      const gateway = await Gateway.deploy();
      await gateway.deployed();
      console.log(`Gateway deployed to: `, gateway.address);
      console.log("\n")

      if (taskArgs.verify) {
        await new Promise(f => setTimeout(f, 10000))

        await hre.run("TASK_VERIFY", {
          address: gateway.address
        });
      }
      return gateway.address;
    }
  );
