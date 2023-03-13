import { ethers } from "hardhat";


async function main() {
  const Receiver = await ethers.getContractFactory("ReceiverMock");
  const receiver = await Receiver.deploy();

  await receiver.deployed();

  console.log(`ReceiverMock deployed to ${receiver.address}`);
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
