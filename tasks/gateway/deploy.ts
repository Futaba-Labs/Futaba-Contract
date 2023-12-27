import { task, types } from "hardhat/config";

task("TASK_DEPLOY_GATEWAY", "Deploy gateway and oracle contract")
  .addParam<string>("fee", "Protocol fee", "", types.string)
  .addParam<boolean>("verify", "Verify gateway contract", false, types.boolean)
  .setAction(
    async (taskArgs, hre): Promise<string> => {
      const Gateway = await hre.ethers.getContractFactory("Gateway");
      if (!taskArgs.fee) throw new Error("fee is required")
      const protocolFee = hre.ethers.utils.parseEther(taskArgs.fee);

      console.log(`Deploying gateway...`);
      const gateway = await hre.upgrades.deployProxy(Gateway, [1, protocolFee]);
      await gateway.deployed();
      console.log(`Gateway deployed to:`, gateway.address);
      if (taskArgs.verify) {
        await new Promise(f => setTimeout(f, 10000))

        await hre.run("TASK_VERIFY", {
          address: gateway.address
        });
      }
      return gateway.address;
    }
  );
