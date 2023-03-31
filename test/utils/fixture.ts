import { ethers } from "hardhat"

export async function deployGatewayFixture() {
  // Contracts are deployed using the first signer/account by default
  const [owner, otherAccount] = await ethers.getSigners()

  const Gateway = await ethers.getContractFactory("Gateway")
  const gateway = await Gateway.deploy()

  return { gateway, owner, otherAccount }
}

export async function deployLightClientMockFixture() {
  // Contracts are deployed using the first signer/account by default
  const [owner, otherAccount] = await ethers.getSigners()

  const LightClientMock = await ethers.getContractFactory("LightClientMock")
  const lcMock = await LightClientMock.deploy()

  return { lcMock, owner, otherAccount }
}

export async function deployFunctionMockFixture() {
  const FunctionMock = await ethers.getContractFactory("FunctionsMock")
  const functionMock = await FunctionMock.deploy()
  await functionMock.deployed()
  return { functionMock }
}
