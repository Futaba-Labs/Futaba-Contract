import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { ChainlinkMock, OracleMock, LinkTokenMock, Operator, OracleTestMock } from "../typechain-types"
import { ethers } from "hardhat"
import { hexlify, hexZeroPad, toUtf8Bytes, parseEther } from "ethers/lib/utils"
import { JOB_ID, SAMPLE_RESPONSE_FOR_NODE, SINGLE_VALUE_PROOF } from "./utils/constants"
import { expect } from "chai"
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs"

// @dev oracleTestMock is a contract without modifier of fullfill()
let chainlinkMock: ChainlinkMock,
  oracleMock: OracleMock,
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

  const ChainlinkMock = await ethers.getContractFactory("ChainlinkMock")
  chainlinkMock = await ChainlinkMock.deploy()
  await chainlinkMock.deployed()

  const OracleMock = await ethers.getContractFactory("OracleMock")
  const jobId = hexlify(hexZeroPad(toUtf8Bytes(JOB_ID), 32))
  oracleMock = await OracleMock.deploy(linkToken.address, jobId, operator.address, parseEther("0.1"), chainlinkMock.address);
  await oracleMock.deployed()

  let tx = await chainlinkMock.setOracle(oracleMock.address)
  await tx.wait()

  tx = await linkToken.mint(oracleMock.address, ethers.utils.parseEther("1000"))
  await tx.wait()

  tx = await chainlinkMock.addToWhitelist([owner.address])
  await tx.wait()
})

describe("OracleMock", async function () {
  it("constructor()", async function () {
    const OracleMock = await ethers.getContractFactory("OracleMock")
    const jobId = hexlify(hexZeroPad(toUtf8Bytes(JOB_ID), 32))
    const newOracleMock = await OracleMock.deploy(linkToken.address, jobId, operator.address, parseEther("0.1"), chainlinkMock.address);
    await newOracleMock.deployed()
    expect(await newOracleMock.getLinkToken()).to.equal(linkToken.address)
    expect(await newOracleMock.getJobId()).to.equal(jobId)
    expect(await newOracleMock.getOracle()).to.equal(operator.address)
    expect(await newOracleMock.getFee()).to.equal(parseEther("0.1"))
    expect(await newOracleMock.getClient()).to.equal(chainlinkMock.address)
  })
  it("notifyOracle() - invalid light client", async function () {
    await expect(oracleMock.connect(owner).notifyOracle([])).to.be.revertedWith("Futaba: only light client can call this function")
  })
  it("notifyOracle()", async function () {
    await expect(chainlinkMock.requestQuery(SINGLE_VALUE_PROOF.queries)).to.emit(operator, "OracleRequest")
  })
  it("fulfill() - invaild oracle", async function () {
    const tx = await chainlinkMock.requestQuery(SINGLE_VALUE_PROOF.queries)
    const receipt = await tx.wait()
    if (receipt.events === undefined) throw new Error("events is undefined")
    const event = receipt.events[3]
    if (event.args === undefined) throw new Error("args is undefined")
    const requestId = event.args[0]

    await expect(oracleMock.fulfill(requestId, SAMPLE_RESPONSE_FOR_NODE)).to.be.revertedWith("Source must be the oracle of the request")
  })
  it("setClient() - onlyOwner", async function () {
    await expect(oracleMock.connect(otherSigner).setClient(otherSigner.address)).to.be.revertedWith("Only callable by owner")
  })
  it("setClient()", async function () {
    const oldClient = await oracleMock.getClient()
    await expect(oracleMock.connect(owner).setClient(owner.address)).to.emit(oracleMock, "SetClient").withArgs(owner.address, oldClient, anyValue)
    expect(await oracleMock.getClient()).to.equal(owner.address)
  })
  it("setOracle() - onlyOwner", async function () {
    await expect(oracleMock.connect(otherSigner).setOracle(otherSigner.address)).to.be.revertedWith("Only callable by owner")
  })
  it("setOracle()", async function () {
    const oldOracle = await oracleMock.getOracle()
    await expect(oracleMock.connect(owner).setOracle(owner.address)).to.emit(oracleMock, "SetOracle").withArgs(owner.address, oldOracle, anyValue)
    expect(await oracleMock.getOracle()).to.equal(owner.address)
  })
  it("setLinkToken() - onlyOwner", async function () {
    await expect(oracleMock.connect(otherSigner).setLinkToken(otherSigner.address)).to.be.revertedWith("Only callable by owner")
  })
  it("setLinkToken()", async function () {
    const oldLinkToken = await oracleMock.getLinkToken()
    await expect(oracleMock.connect(owner).setLinkToken(owner.address)).to.emit(oracleMock, "SetLinkToken").withArgs(owner.address, oldLinkToken, anyValue)
    expect(await oracleMock.getLinkToken()).to.equal(owner.address)
  })
  it("setJobId() - onlyOwner", async function () {
    const jobId = hexlify(hexZeroPad(toUtf8Bytes("test"), 32))
    await expect(oracleMock.connect(otherSigner).setJobId(jobId)).to.be.revertedWith("Only callable by owner")
  })
  it("setJobId()", async function () {
    const oldJobId = await oracleMock.getJobId()
    const jobId = hexlify(hexZeroPad(toUtf8Bytes("test"), 32))
    await expect(oracleMock.connect(owner).setJobId(jobId)).to.emit(oracleMock, "SetJobId").withArgs(jobId, oldJobId, anyValue)
    expect(await oracleMock.getJobId()).to.equal(jobId)
  })
  it("setFee() - onlyOwner", async function () {
    const fee = parseEther("1")
    await expect(oracleMock.connect(otherSigner).setFee(fee)).to.be.revertedWith("Only callable by owner")
  })
  it("setFee()", async function () {
    const oldFee = await oracleMock.getFee()
    const fee = parseEther("1")
    await expect(oracleMock.connect(owner).setFee(fee)).to.emit(oracleMock, "SetFee").withArgs(fee, oldFee, anyValue)
    expect(await oracleMock.getFee()).to.equal(fee)
  })

})
