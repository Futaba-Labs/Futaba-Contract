import { ethers } from "hardhat";


async function main() {
  const StorageProofMock = await ethers.getContractFactory("StorageProofMock");
  const mock = await StorageProofMock.deploy();

  await mock.deployed();

  console.log(`StorageProofMock deployed to ${mock.address}`);
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
