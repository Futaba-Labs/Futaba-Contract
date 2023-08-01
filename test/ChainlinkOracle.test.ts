import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { ChainlinkLightClient, ChainlinkOracle, LinkTokenMock, Operator } from "../typechain-types"
import { ethers } from "hardhat"
import { hexlify, hexZeroPad, toUtf8Bytes, parseEther } from "ethers/lib/utils"
import { JOB_ID, SAMPLE_RESPONSE_FOR_NODE, SINGLE_VALUE_PROOF } from "./utils/constants"
import { expect } from "chai"
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs"

// @dev oracleTestMock is a contract without modifier of fulfill()
let chainlinkLightClient: ChainlinkLightClient,
  chainlinkOracle: ChainlinkOracle,
  linkToken: LinkTokenMock,
  operator: Operator,
  owner: SignerWithAddress,
  otherSigner: SignerWithAddress

before(async function () {
  [owner, otherSigner] = await ethers.getSigners()
  const LinkTokenMock = await ethers.getContractFactory("LinkTokenMock")
  const linkMock = await LinkTokenMock.deploy()
  await linkMock.deployed()
  linkToken = linkMock

  const Operator = await ethers.getContractFactory("Operator")
  operator = await Operator.deploy(linkToken.address, owner.address)
  await operator.deployed()

  const ChainlinkLightClient = await ethers.getContractFactory("ChainlinkLightClient")
  chainlinkLightClient = await ChainlinkLightClient.deploy()
  await chainlinkLightClient.deployed()

  const ChainlinkOracle = await ethers.getContractFactory("ChainlinkOracle")
  const jobId = hexlify(hexZeroPad(toUtf8Bytes(JOB_ID), 32))
  chainlinkOracle = await ChainlinkOracle.deploy(linkToken.address, jobId, operator.address, parseEther("0.1"), chainlinkLightClient.address);
  await chainlinkOracle.deployed()

  let tx = await chainlinkLightClient.setOracle(chainlinkOracle.address)
  await tx.wait()

  tx = await linkToken.mint(chainlinkOracle.address, ethers.utils.parseEther("1000"))
  await tx.wait()

  tx = await chainlinkLightClient.addToWhitelist([owner.address])
  await tx.wait()
})

describe("ChainlinkOracle", async function () {
  it("constructor()", async function () {
    const ChainlinkOracle = await ethers.getContractFactory("ChainlinkOracle")
    const jobId = hexlify(hexZeroPad(toUtf8Bytes(JOB_ID), 32))
    const newChainlinkOracle = await ChainlinkOracle.deploy(linkToken.address, jobId, operator.address, parseEther("0.1"), chainlinkLightClient.address);
    await newChainlinkOracle.deployed()
    expect(await newChainlinkOracle.getLinkToken()).to.equal(linkToken.address)
    expect(await newChainlinkOracle.getJobId()).to.equal(jobId)
    expect(await newChainlinkOracle.getOracle()).to.equal(operator.address)
    expect(await newChainlinkOracle.getFee()).to.equal(parseEther("0.1"))
    expect(await newChainlinkOracle.getClient()).to.equal(chainlinkLightClient.address)
  })
  it("notifyOracle() - invalid light client", async function () {
    await expect(chainlinkOracle.connect(owner).notifyOracle([])).to.be.revertedWith("Futaba: only light client can call this function")
  })
  it("notifyOracle()", async function () {
    await expect(chainlinkLightClient.requestQuery(SINGLE_VALUE_PROOF.queries)).to.emit(operator, "OracleRequest")
  })
  it("fulfill() - invaild oracle", async function () {
    const tx = await chainlinkLightClient.requestQuery(SINGLE_VALUE_PROOF.queries)
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
  it("setClient()", async function () {
    const oldClient = await chainlinkOracle.getClient()
    await expect(chainlinkOracle.connect(owner).setClient(owner.address)).to.emit(chainlinkOracle, "SetClient").withArgs(owner.address, oldClient, anyValue)
    expect(await chainlinkOracle.getClient()).to.equal(owner.address)
  })
  it("setOracle() - onlyOwner", async function () {
    await expect(chainlinkOracle.connect(otherSigner).setOracle(otherSigner.address)).to.be.revertedWith("Only callable by owner")
  })
  it("setOracle()", async function () {
    const oldOracle = await chainlinkOracle.getOracle()
    await expect(chainlinkOracle.connect(owner).setOracle(owner.address)).to.emit(chainlinkOracle, "SetOracle").withArgs(owner.address, oldOracle, anyValue)
    expect(await chainlinkOracle.getOracle()).to.equal(owner.address)
  })
  it("setLinkToken() - onlyOwner", async function () {
    await expect(chainlinkOracle.connect(otherSigner).setLinkToken(otherSigner.address)).to.be.revertedWith("Only callable by owner")
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
  it("setFee()", async function () {
    const oldFee = await chainlinkOracle.getFee()
    const fee = parseEther("1")
    await expect(chainlinkOracle.connect(owner).setFee(fee)).to.emit(chainlinkOracle, "SetFee").withArgs(fee, oldFee, anyValue)
    expect(await chainlinkOracle.getFee()).to.equal(fee)
  })

})
