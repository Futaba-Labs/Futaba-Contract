import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { ChainlinkMock, OracleMock, LinkTokenMock, Operator } from "../typechain-types"
import { ethers } from "hardhat"
import { defaultAbiCoder } from "@ethersproject/abi"
import { expect } from "chai"
import { QueryType } from "../typechain-types/contracts/Gateway"
import { DSTCHAINID, SRC, HEIGTH } from "./utils/constants"
import { getSlots } from "./utils/helper"

let chainlinkMock: ChainlinkMock,
  oracleMock: OracleMock,
  linkToken: LinkTokenMock,
  operator: Operator,
  owner: SignerWithAddress

before(async function () {
  [owner] = await ethers.getSigners()
  const LinkTokenMock = await ethers.getContractFactory("LinkTokenMock")
  const linkMock = await LinkTokenMock.deploy()
  await linkMock.deployed()
  linkToken = linkMock

  const OracleMock = await ethers.getContractFactory("OracleTestMock")
  oracleMock = await OracleMock.deploy(linkToken.address)
  await oracleMock.deployed()

  const ChainlinkMock = await ethers.getContractFactory("ChainlinkMock")
  chainlinkMock = await ChainlinkMock.deploy()
  await chainlinkMock.deployed()

  const Operator = await ethers.getContractFactory("Operator")
  operator = await Operator.deploy(linkToken.address, owner.address)
  await operator.deployed()

  let tx = await chainlinkMock.setOracle(oracleMock.address)
  await tx.wait()
  tx = await oracleMock.setClient(owner.address)
  await tx.wait()
  tx = await oracleMock.setOracle(operator.address)
  await tx.wait()
  tx = await linkToken.mint(oracleMock.address, ethers.utils.parseEther("1000"))
  await tx.wait()
})

describe("OracleMock", async function () {
  it("notifyOracle()", async function () { })
  it("fulfill() - invalid light client", async function () { })
  it("fulfill()", async function () { })
})
