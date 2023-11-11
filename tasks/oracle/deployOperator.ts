import { task, types } from "hardhat/config";
import ORACLE from "../../constants/oracle.json"

task("TASK_DEPLOY_OPERATOR", "Deploys the operator contract")
  .addParam<boolean>("verify", "Verify gateway contract", false, types.boolean)
  .setAction(
    async (taskArgs, hre): Promise<string> => {
      const Operator = await hre.ethers.getContractFactory("Operator");
      const oracleConfig = ORACLE[hre.network.name as keyof typeof ORACLE]
      const [owner] = await hre.ethers.getSigners();

      const linkToken = oracleConfig.token

      console.log(`Deploying operator...`);
      const operator = await Operator.deploy(linkToken, owner.address);
      await operator.deployed();
      console.log(`Operator deployed to: `, operator.address);

      if (taskArgs.verify) {
        await new Promise(f => setTimeout(f, 10000))
        await hre.run("TASK_VERIFY", {
          address: operator.address,
          arguments: [linkToken]
        });
      }

      return operator.address;
    }
  );
