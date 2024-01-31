import { task, types } from "hardhat/config";
import ORACLE from "../../constants/oracle.json"
import { parseEther } from "ethers/lib/utils";

task("TASK_DEPLOY_ORACLE", "Deploys the oracle contract")
  .addParam<boolean>("verify", "Verify gateway contract", false, types.boolean)
  .addParam<string>("client", "Light Client address", "", types.string)
  .addParam<string>("operator", "Light Client address", "", types.string)
  .setAction(
    async (taskArgs, hre): Promise<string> => {
      const Oracle = await hre.ethers.getContractFactory("ChainlinkOracle");
      const oracleConfig = ORACLE[hre.network.name as keyof typeof ORACLE]

      const client = taskArgs.client

      console.log(`Deploying oracle...`);
      const jobId = hre.ethers.utils.hexlify(hre.ethers.utils.hexZeroPad(hre.ethers.utils.toUtf8Bytes(oracleConfig.jobId), 32));
      const linkToken = oracleConfig.token;
      const oracle = await Oracle.deploy(linkToken, jobId, taskArgs.operator, parseEther("0.001"), client);
      await oracle.deployed();
      console.log(`Oracle deployed to: `, oracle.address);

      if (taskArgs.verify) {
        await new Promise(f => setTimeout(f, 10000))
        await hre.run("TASK_VERIFY", {
          address: oracle.address,
          arguments: [linkToken, jobId, taskArgs.operator, parseEther("0.001").toString(), client]
        });
      }

      return oracle.address;
    }
  );
