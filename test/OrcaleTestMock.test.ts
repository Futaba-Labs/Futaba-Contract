import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { ChainlinkMock, OracleMock, LinkTokenMock, Operator, OracleTestMock } from "../typechain-types"
import { ethers } from "hardhat"
import { hexlify, hexZeroPad, toUtf8Bytes, parseEther, keccak256, BytesLike } from "ethers/lib/utils"
import { JOB_ID, SAMPLE_RESPONSE_FOR_NODE, ZERO_ADDRESS } from "./utils/constants"
import { expect } from "chai"

// @dev oracleTestMock is a contract without modifier of fulfill()
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

  const ChainlinkMock = await ethers.getContractFactory("ChainlinkMock")
  chainlinkMock = await ChainlinkMock.deploy()
  await chainlinkMock.deployed()

  const OracleTestMock = await ethers.getContractFactory("OracleTestMock")
  const jobId = hexlify(hexZeroPad(toUtf8Bytes(JOB_ID), 32))
  oracleTestMock = await OracleTestMock.deploy(linkToken.address, jobId, operator.address, parseEther("0.1"), chainlinkMock.address);
  await oracleTestMock.deployed()

  let tx = await chainlinkMock.setOracle(oracleTestMock.address)
  await tx.wait()
  tx = await oracleTestMock.setClient(chainlinkMock.address)
  await tx.wait()
  tx = await linkToken.mint(oracleTestMock.address, ethers.utils.parseEther("1000"))
  await tx.wait()
})

describe("OracleTestMock", async function () {
  it("fulfill() - invalid light client", async function () {
    const tx = await oracleTestMock.setClient(ethers.constants.AddressZero)
    await tx.wait()
    await expect(oracleTestMock.fulfill(hexZeroPad(ZERO_ADDRESS, 32), SAMPLE_RESPONSE_FOR_NODE)).to.be.revertedWith("Futaba: invalid ligth client")
  })

  it("fulfill() - light client with no interface defined", async function () {
    const tx = await oracleTestMock.setClient(owner.address)
    await tx.wait()
    await expect(oracleTestMock.fulfill(hexZeroPad(ZERO_ADDRESS, 32), SAMPLE_RESPONSE_FOR_NODE)).to.be.reverted
  })

  it("fulfill()", async function () {
    const tx = await oracleTestMock.setClient(chainlinkMock.address)
    await tx.wait()
    const responses = ethers.utils.defaultAbiCoder.decode(["tuple(uint32 dstChainId, uint256 height, bytes32 root)[]"], SAMPLE_RESPONSE_FOR_NODE)
    const res = responses[0][0]
    await expect(oracleTestMock.fulfill(hexZeroPad(ZERO_ADDRESS, 32), SAMPLE_RESPONSE_FOR_NODE)).to.emit(chainlinkMock, "UpdateStateRoot").withArgs(res.dstChainId, res.height, res.root)
  })
})
