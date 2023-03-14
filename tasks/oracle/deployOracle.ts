import { task } from "hardhat/config";
import DEPLOYMENTS from "../../constants/deployments.json"

task("TASK_DEPLOY_ORACLE", "Deploys the oracle contract")
  .setAction(
    async (taskArgs, hre): Promise<string> => {
      const Oracle = await hre.ethers.getContractFactory("Oracle");
      const linkToken = DEPLOYMENTS["link_token"][hre.network.config.chainId?.toString() as keyof typeof DEPLOYMENTS["link_token"]]

      const oracle = await Oracle.deploy(linkToken);
      await oracle.deployed();
      console.log(`Oracle deployed to: `, oracle.address);

      await new Promise(f => setTimeout(f, 10000))

      await hre.run("TASK_VERIFY", {
        address: oracle.address,
        arguments: [linkToken]
      });

      return oracle.address;
    }
  );
