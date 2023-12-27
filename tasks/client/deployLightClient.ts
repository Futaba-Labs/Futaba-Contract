import { task, types } from "hardhat/config";

task("TASK_DEPLOY_LIGHT_CLIENT", "Deploys the light client contract")
  .addParam<string>("gateway", "Gateway contract address", "", types.string)
  .addParam<string>("oracle", "Oracle contract address", "", types.string)
  .addParam<string>("feed", "Chainlink feed contract address", "", types.string)
  .addParam<string>("gaslimit", "Gas limit", "", types.string)
  .addParam<string>("gasprice", "Gas price", "", types.string)
  .addParam<string>("gasperquery", "Gas per query", "", types.string)
  .addParam<boolean>("verify", "Verify gateway contract", false, types.boolean)
  .setAction(
    async (taskArgs, hre): Promise<string> => {
      const LigthClient = await hre.ethers.getContractFactory("ChainlinkLightClient");
      const gateway = taskArgs.gateway,
        oracle = taskArgs.oracle,
        feed = taskArgs.feed
      if (!gateway || !oracle || !feed) {
        throw new Error("Contract address is required");
      }
      if (!taskArgs.gaslimit || !taskArgs.gasprice || !taskArgs.gasperquery) {
        throw new Error("Gas limit, gas price and gas per query are required");
      }
      const gasLimit = hre.ethers.BigNumber.from(taskArgs.gaslimit),
        gasPrice = hre.ethers.BigNumber.from(taskArgs.gasprice),
        gasPerQuery = hre.ethers.BigNumber.from(taskArgs.gasperquery);

      console.log(`Deploying light client...`);
      const client = await LigthClient.deploy(gateway, oracle, feed, gasLimit, gasPrice, gasPerQuery);
      await client.deployed();
      console.log(`LightClient deployed to: `, client.address);
      if (taskArgs.verify) {
        await hre.run("TASK_VERIFY", {
          address: client.address,
          arguments: [gateway, oracle]
        });
      }
      await new Promise(f => setTimeout(f, 10000))
      return client.address;
    }
  );
