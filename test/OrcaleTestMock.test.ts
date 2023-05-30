import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { ChainlinkMock, OracleMock, LinkTokenMock, Operator, OracleTestMock } from "../typechain-types"
import { ethers } from "hardhat"
import { hexlify, hexZeroPad, toUtf8Bytes, parseEther } from "ethers/lib/utils"
import { JOB_ID } from "./utils/constants"

// @dev oracleTestMock is a contract without modifier of fullfill()
let chainlinkMock: ChainlinkMock,
  oracleTestMock: OracleTestMock,
  linkToken: LinkTokenMock,
  operator: Operator,
  owner: SignerWithAddress

before(async function () {
  [owner] = await ethers.getSigners()
  const LinkTokenMock = await ethers.getContractFactory("LinkTokenMock")
  const linkMock = await LinkTokenMock.deploy()
  await linkMock.deployed()
  linkToken = linkMock

  const Operator = await ethers.getContractFactory("Operator")
  operator = await Operator.deploy(linkToken.address, owner.address)
  await operator.deployed()

  const OracleTestMock = await ethers.getContractFactory("OracleTestMock")
  const jobId = hexlify(hexZeroPad(toUtf8Bytes(JOB_ID), 32))
  oracleTestMock = await OracleTestMock.deploy(linkToken.address, jobId, operator.address, parseEther("0.1"));
  await oracleTestMock.deployed()

  const ChainlinkMock = await ethers.getContractFactory("ChainlinkMock")
  chainlinkMock = await ChainlinkMock.deploy()
  await chainlinkMock.deployed()

  let tx = await chainlinkMock.setOracle(oracleTestMock.address)
  await tx.wait()
  tx = await oracleTestMock.setClient(owner.address)
  await tx.wait()
  tx = await linkToken.mint(oracleTestMock.address, ethers.utils.parseEther("1000"))
  await tx.wait()
})

describe("OracleTestMock", async function () {
  it("fulfill() - invalid light client", async function () { })
  it("fulfill()", async function () { })
})
