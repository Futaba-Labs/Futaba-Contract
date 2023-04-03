import { ethers } from "hardhat"
import { SRC } from "./constants"

export async function deployGatewayFixture() {
  // Contracts are deployed using the first signer/account by default
  const [owner, otherAccount] = await ethers.getSigners()

  const Gateway = await ethers.getContractFactory("Gateway")
  const gateway = await Gateway.deploy()
  await gateway.deployed()

  return { gateway, owner, otherAccount }
}

export async function deployLightClientMockFixture() {
  // Contracts are deployed using the first signer/account by default
  const [owner, otherAccount] = await ethers.getSigners()

  const LightClientMock = await ethers.getContractFactory("LightClientMock")
  const lcMock = await LightClientMock.deploy()
  await lcMock.deployed()

  return { lcMock, owner, otherAccount }
}

export async function deployFunctionMockFixture() {
  // Contracts are deployed using the first signer/account by default
  const [owner, otherAccount] = await ethers.getSigners()

  const FunctionMock = await ethers.getContractFactory("FunctionsMock")
  const functionMock = await FunctionMock.deploy()
  await functionMock.deployed()
  return { functionMock }
}

export async function deployReceiverMockFixture() {
  // Contracts are deployed using the first signer/account by default
  const [owner, otherAccount] = await ethers.getSigners()

  const ReceiverMock = await ethers.getContractFactory("ReceiverMock")
  const receiverMock = await ReceiverMock.deploy()
  await receiverMock.deployed()
  return { receiverMock }
}

async function deployOracleMockFixture() {
  // Contracts are deployed using the first signer/account by default
  const [owner, otherAccount] = await ethers.getSigners()

  const OracleMock = await ethers.getContractFactory("OracleMock")
  const oracleMock = await OracleMock.deploy(SRC)

  return { oracleMock, owner, otherAccount }
}
