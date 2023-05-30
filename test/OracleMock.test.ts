import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { ChainlinkMock, OracleMock, LinkTokenMock, Operator, OracleTestMock } from "../typechain-types"
import { ethers } from "hardhat"
import { hexlify, hexZeroPad, toUtf8Bytes, parseEther } from "ethers/lib/utils"
import { JOB_ID } from "./utils/constants"

// @dev oracleTestMock is a contract without modifier of fullfill()
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

  const Operator = await ethers.getContractFactory("Operator")
  operator = await Operator.deploy(linkToken.address, owner.address)
  await operator.deployed()

  const OracleMock = await ethers.getContractFactory("OracleMock")
  const jobId = hexlify(hexZeroPad(toUtf8Bytes(JOB_ID), 32))
  oracleMock = await OracleMock.deploy(linkToken.address, jobId, operator.address, parseEther("0.1"));
  await oracleMock.deployed()

  const ChainlinkMock = await ethers.getContractFactory("ChainlinkMock")
  chainlinkMock = await ChainlinkMock.deploy()
  await chainlinkMock.deployed()

  let tx = await chainlinkMock.setOracle(oracleMock.address)
  await tx.wait()
  tx = await oracleMock.setClient(owner.address)
  await tx.wait()
  tx = await linkToken.mint(oracleMock.address, ethers.utils.parseEther("1000"))
  await tx.wait()
})

describe("OracleMock", async function () {
  it("constructor() - invalid link token", async function () { })
  it("constructor() - invalid operator address", async function () { })
  it("constructor()", async function () { })
  it("notifyOracle() - invalid light client", async function () { })
  it("notifyOracle()", async function () { })
  it("fulfill() - invaild oracle", async function () { })
  it("setClient()", async function () { })
  it("getClient()", async function () { })
  it("setOracle()", async function () { })
  it("getOracle()", async function () { })
  it("setJobId()", async function () { })
  it("getJobId()", async function () { })
  it("setFee()", async function () { })
  it("getFee()", async function () { })
})
