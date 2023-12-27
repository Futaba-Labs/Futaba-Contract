import { ethers, network } from "hardhat";
import DEPLOYMENTS from "../constants/deployments.json"

async function main() {
  const Receiver = await ethers.getContractFactory("ReceiverMock");
  const gatewayAddress = DEPLOYMENTS[network.name as keyof typeof DEPLOYMENTS].gateway
  const receiver = await Receiver.deploy(gatewayAddress);

  await receiver.deployed();

  console.log(`ReceiverMock deployed to ${receiver.address}`);
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
