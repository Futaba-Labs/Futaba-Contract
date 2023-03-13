import { ethers } from "hardhat";


async function main() {
  const LC = await ethers.getContractFactory("LightClientMock");
  const lc = await LC.deploy();

  await lc.deployed();

  console.log(`LightClientMock deployed to ${lc.address}`);
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
