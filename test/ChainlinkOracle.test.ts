import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { ChainlinkLightClientMock, ChainlinkOracle, LinkTokenMock, Operator } from "../typechain-types"
import { ethers } from "hardhat"
import { hexlify, hexZeroPad, toUtf8Bytes, parseEther } from "ethers/lib/utils"
import { GAS_DATA, JOB_ID, SAMPLE_RESPONSE_FOR_NODE, SINGLE_VALUE_PROOF } from "./utils/constants"
import { expect } from "chai"
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs"

// @dev oracleTestMock is a contract without modifier of fulfill()
let chainlinkLightClientMock: ChainlinkLightClientMock,
  chainlinkOracle: ChainlinkOracle,
  linkToken: LinkTokenMock,
  operator: Operator,
  owner: SignerWithAddress,
  otherSigner: SignerWithAddress

const oracleFee = parseEther("0.1")
const gasData = GAS_DATA

before(async function () {
  [owner, otherSigner] = await ethers.getSigners()
  const LinkTokenMock = await ethers.getContractFactory("LinkTokenMock")
  const linkMock = await LinkTokenMock.deploy()
  await linkMock.deployed()
  linkToken = linkMock

  const Operator = await ethers.getContractFactory("Operator")
  operator = await Operator.deploy(linkToken.address, owner.address)
  await operator.deployed()

  const ChainlinkOracle = await ethers.getContractFactory("ChainlinkOracle")
  const jobId = hexlify(hexZeroPad(toUtf8Bytes(JOB_ID), 32))
  chainlinkOracle = await ChainlinkOracle.deploy(linkToken.address, jobId, operator.address, parseEther("0.1"), operator.address);
  await chainlinkOracle.deployed()

  const AggregatorV3Mock = await ethers.getContractFactory("AggregatorV3Mock")
  const aggregatorV3Mock = await AggregatorV3Mock.deploy(8, "Gateway Test", 1, oracleFee)
  await aggregatorV3Mock.deployed()

  const ChainlinkLightClient = await ethers.getContractFactory("ChainlinkLightClientMock")
  chainlinkLightClientMock = await ChainlinkLightClient.deploy(chainlinkOracle.address, chainlinkOracle.address, aggregatorV3Mock.address, gasData.gasLimit, gasData.gasPrice, gasData.gasPerQuery)
  await chainlinkLightClientMock.deployed()

  let tx = await linkToken.mint(chainlinkOracle.address, ethers.utils.parseEther("1000"))
  await tx.wait()

  tx = await chainlinkOracle.setClient(chainlinkLightClientMock.address)
  await tx.wait()
})

describe("ChainlinkOracle", async function () {
  it("constructor()", async function () {
    const ChainlinkOracle = await ethers.getContractFactory("ChainlinkOracle")
    const jobId = hexlify(hexZeroPad(toUtf8Bytes(JOB_ID), 32))
    const newChainlinkOracle = await ChainlinkOracle.deploy(linkToken.address, jobId, operator.address, parseEther("0.1"), chainlinkLightClientMock.address);
    await newChainlinkOracle.deployed()
    expect(await newChainlinkOracle.getLinkToken()).to.equal(linkToken.address)
    expect(await newChainlinkOracle.getJobId()).to.equal(jobId)
    expect(await newChainlinkOracle.getOracle()).to.equal(operator.address)
    expect(await newChainlinkOracle.getFee()).to.equal(parseEther("0.1"))
    expect(await newChainlinkOracle.getClient()).to.equal(chainlinkLightClientMock.address)
  })

  it("notifyOracle() - invalid light client", async function () {
    await expect(chainlinkOracle.connect(owner).notifyOracle([])).to.be.revertedWithCustomError(chainlinkOracle, "NotAuthorized")
  })

  it("notifyOracle()", async function () {
    await expect(chainlinkLightClientMock.requestQuery(SINGLE_VALUE_PROOF.queries)).to.emit(operator, "OracleRequest")
  })

  it("fulfill() - invaild oracle", async function () {
    const tx = await chainlinkLightClientMock.requestQuery(SINGLE_VALUE_PROOF.queries)
    const receipt = await tx.wait()
    if (receipt.events === undefined) throw new Error("events is undefined")
    const event = receipt.events[3]
    if (event.args === undefined) throw new Error("args is undefined")
    const requestId = event.args[0]

    await expect(chainlinkOracle.fulfill(requestId, SAMPLE_RESPONSE_FOR_NODE)).to.be.revertedWith("Source must be the oracle of the request")
  })

  it("setClient() - onlyOwner", async function () {
    await expect(chainlinkOracle.connect(otherSigner).setClient(otherSigner.address)).to.be.revertedWith("Only callable by owner")
  })

  it("setClient() - client is zero address", async function () {
    await expect(chainlinkOracle.connect(owner).setClient(ethers.constants.AddressZero)).to.be.revertedWithCustomError(chainlinkOracle, "InvalidInputZeroAddress")
  })

  it("setClient()", async function () {
    const oldClient = await chainlinkOracle.getClient()
    await expect(chainlinkOracle.connect(owner).setClient(owner.address)).to.emit(chainlinkOracle, "SetClient").withArgs(owner.address, oldClient, anyValue)
    expect(await chainlinkOracle.getClient()).to.equal(owner.address)
  })

  it("setOracle() - onlyOwner", async function () {
    await expect(chainlinkOracle.connect(otherSigner).setOracle(otherSigner.address)).to.be.revertedWith("Only callable by owner")
  })

  it("setOracle() - oracle is zero address", async function () {
    await expect(chainlinkOracle.connect(owner).setOracle(ethers.constants.AddressZero)).to.be.revertedWithCustomError(chainlinkOracle, "InvalidInputZeroAddress")
  })

  it("setOracle()", async function () {
    const oldOracle = await chainlinkOracle.getOracle()
    await expect(chainlinkOracle.connect(owner).setOracle(owner.address)).to.emit(chainlinkOracle, "SetOracle").withArgs(owner.address, oldOracle, anyValue)
    expect(await chainlinkOracle.getOracle()).to.equal(owner.address)
  })

  it("setLinkToken() - onlyOwner", async function () {
    await expect(chainlinkOracle.connect(otherSigner).setLinkToken(otherSigner.address)).to.be.revertedWith("Only callable by owner")
  })

  it("setLinkToken() - linkToken is zero address", async function () {
    await expect(chainlinkOracle.connect(owner).setLinkToken(ethers.constants.AddressZero)).to.be.revertedWithCustomError(chainlinkOracle, "InvalidInputZeroAddress")
  })

  it("setLinkToken()", async function () {
    const oldLinkToken = await chainlinkOracle.getLinkToken()
    await expect(chainlinkOracle.connect(owner).setLinkToken(owner.address)).to.emit(chainlinkOracle, "SetLinkToken").withArgs(owner.address, oldLinkToken, anyValue)
    expect(await chainlinkOracle.getLinkToken()).to.equal(owner.address)
  })

  it("setJobId() - onlyOwner", async function () {
    const jobId = hexlify(hexZeroPad(toUtf8Bytes("test"), 32))
    await expect(chainlinkOracle.connect(otherSigner).setJobId(jobId)).to.be.revertedWith("Only callable by owner")
  })

  it("setJobId() - jobId is zero value", async function () {
    const jobId = hexlify(hexZeroPad(toUtf8Bytes(""), 32))
    await expect(chainlinkOracle.connect(owner).setJobId(jobId)).to.be.revertedWithCustomError(chainlinkOracle, "InvalidInputEmptyBytes32")
  })

  it("setJobId()", async function () {
    const oldJobId = await chainlinkOracle.getJobId()
    const jobId = hexlify(hexZeroPad(toUtf8Bytes("test"), 32))
    await expect(chainlinkOracle.connect(owner).setJobId(jobId)).to.emit(chainlinkOracle, "SetJobId").withArgs(jobId, oldJobId, anyValue)
    expect(await chainlinkOracle.getJobId()).to.equal(jobId)
  })

  it("setFee() - onlyOwner", async function () {
    const fee = parseEther("1")
    await expect(chainlinkOracle.connect(otherSigner).setFee(fee)).to.be.revertedWith("Only callable by owner")
  })

  it("setFee() - fee is zero", async function () {
    const fee = parseEther("0")
    await expect(chainlinkOracle.connect(owner).setFee(fee)).to.be.revertedWithCustomError(chainlinkOracle, "NodeOperatorFeeCannotBeZero")
  })

  it("setFee() - fee is greater than 1", async function () {
    const fee = parseEther("1.1")
    await expect(chainlinkOracle.connect(owner).setFee(fee)).to.be.revertedWithCustomError(chainlinkOracle, "MaxNodeOperatorFee")
  })

  it("setFee() - fee is less than 0.001", async function () {
    const fee = parseEther("0.0009")
    await expect(chainlinkOracle.connect(owner).setFee(fee)).to.be.revertedWithCustomError(chainlinkOracle, "MinNodeOperatorFee")
  })

  it("setFee()", async function () {
    const oldFee = await chainlinkOracle.getFee()
    const fee = parseEther("1")
    await expect(chainlinkOracle.connect(owner).setFee(fee)).to.emit(chainlinkOracle, "SetFee").withArgs(fee, oldFee, anyValue)
    expect(await chainlinkOracle.getFee()).to.equal(fee)
  })

})
