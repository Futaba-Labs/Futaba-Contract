import { task, types } from "hardhat/config";

task("TASK_UPGRADE_GATEWAY", "Upgrade gateway contract")
  .addParam<string>("proxy", "Proxy contract address", "", types.string)
  .addParam<boolean>("verify", "Verify gateway contract", false, types.boolean)
  .setAction(
    async (taskArgs, hre): Promise<string> => {
      const Gateway = await hre.ethers.getContractFactory("Gateway");
      const proxy = taskArgs.proxy
      if (!proxy) throw new Error("No proxy address provided")

      console.log(`Upgrading gateway...`);
      const upgradedGaterway = await hre.upgrades.upgradeProxy(proxy, Gateway);
      console.log(`Upgraded gateway to:`, upgradedGaterway.address);
      if (taskArgs.verify) {
        await new Promise(f => setTimeout(f, 10000))

        await hre.run("TASK_VERIFY", {
          address: upgradedGaterway.address
        });
      }
      return upgradedGaterway.address;
    }
  );
