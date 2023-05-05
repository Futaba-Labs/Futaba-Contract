import { task, types } from "hardhat/config";
import DEPLOYMENTS from "../../constants/deployments.json"

task("TASK_DEPLOY_ORACLE", "Deploys the oracle contract")
  .addParam<boolean>("verify", "Verify gateway contract", false, types.boolean)
  .setAction(
    async (taskArgs, hre): Promise<string> => {
      const Oracle = await hre.ethers.getContractFactory("OracleMock");
      const linkToken = DEPLOYMENTS[hre.network.name as keyof typeof DEPLOYMENTS]["link_token"]

      const oracle = await Oracle.deploy(linkToken);
      await oracle.deployed();
      console.log(`Oracle deployed to: `, oracle.address);

      if (taskArgs.verify) {
        await new Promise(f => setTimeout(f, 10000))
        await hre.run("TASK_VERIFY", {
          address: oracle.address,
          arguments: [linkToken]
        });
      }

      return oracle.address;
    }
  );
