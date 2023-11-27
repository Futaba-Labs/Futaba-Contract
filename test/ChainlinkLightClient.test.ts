import { ChainlinkLightClient, ChainlinkLightClientMock, LinkTokenMock, Operator, OracleTestMock } from "../typechain-types"
import { ethers, upgrades } from "hardhat"
import { Gateway, QueryType } from "../typechain-types/contracts/Gateway"
import { ACCOUNT_PROOF, DSTCHAINID, DSTCHAINID_GOERLI, HEIGTH, HEIGTH_GOERLI, JOB_ID, SRC, STORAGE_PROOF, ZERO_ADDRESS, ZERO_VALUE_STORAGE_PROOF } from "./utils/constants"
import { getSlots, updateHeaderForNode } from "./utils/helper"
import { expect } from "chai"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { defaultAbiCoder } from "@ethersproject/abi"
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs"
import { hexlify, hexZeroPad, toUtf8Bytes, parseEther } from "ethers/lib/utils"

describe("ChainlinkLightClient", async function () {
  let gateway: Gateway,
    chainlinkLightClient: ChainlinkLightClient,
    chainlinkLightClientMock: ChainlinkLightClientMock,
    oracleMock: OracleTestMock,
    linkToken: LinkTokenMock,
    operator: Operator,
    owner: SignerWithAddress,
    otherSingners: SignerWithAddress[]

  const oracleResponses = [
    { dstChainId: DSTCHAINID, height: HEIGTH, root: ethers.utils.formatBytes32String("0x1234") },
    { dstChainId: DSTCHAINID, height: HEIGTH_GOERLI, root: ethers.utils.formatBytes32String("0x12345") },
  ]


  before(async function () {
    [owner, ...otherSingners] = await ethers.getSigners()
    const Gateway = await ethers.getContractFactory("Gateway")
    const g = await upgrades.deployProxy(Gateway, [1], { initializer: 'initialize', kind: 'uups' });
    await g.deployed()
    gateway = g as Gateway

    const LinkTokenMock = await ethers.getContractFactory("LinkTokenMock")
    const linkMock = await LinkTokenMock.deploy()
    await linkMock.deployed()
    linkToken = linkMock

    const Operator = await ethers.getContractFactory("Operator")
    operator = await Operator.deploy(linkToken.address, owner.address)
    await operator.deployed()

    const OracleMock = await ethers.getContractFactory("OracleTestMock")
    const jobId = hexlify(hexZeroPad(toUtf8Bytes(JOB_ID), 32))
    oracleMock = await OracleMock.deploy(linkToken.address, jobId, operator.address, parseEther("0.1"), operator.address);
    await oracleMock.deployed()

    const ChainlinkLightClientMock = await ethers.getContractFactory("ChainlinkLightClientMock")
    chainlinkLightClientMock = await ChainlinkLightClientMock.deploy(oracleMock.address)
    await chainlinkLightClientMock.deployed()

    const ChainlinkLightClient = await ethers.getContractFactory("ChainlinkLightClient")
    chainlinkLightClient = await ChainlinkLightClient.deploy(gateway.address, oracleMock.address)
    await chainlinkLightClient.deployed()

    let tx = await oracleMock.setClient(chainlinkLightClient.address)
    await tx.wait()
    tx = await linkToken.mint(oracleMock.address, ethers.utils.parseEther("1000"))
    await tx.wait()
  })

  it("constructor() - oracle zero address", async function () {
    const ChainlinkLightClient = await ethers.getContractFactory("ChainlinkLightClient")
    await expect(ChainlinkLightClient.deploy(gateway.address, ethers.constants.AddressZero)).to.be.revertedWithCustomError(ChainlinkLightClient, "ZeroAddressNotAllowed")
  })
  it("constructor() - gateway zero address", async function () {
    const ChainlinkLightClient = await ethers.getContractFactory("ChainlinkLightClient")
    await expect(ChainlinkLightClient.deploy(ethers.constants.AddressZero, oracleMock.address)).to.be.revertedWithCustomError(ChainlinkLightClient, "ZeroAddressNotAllowed")
  })

  it("constructor()", async function () {
    const ChainlinkLightClient = await ethers.getContractFactory("ChainlinkLightClient")
    const newChainlinkLightClient = await ChainlinkLightClient.deploy(gateway.address, oracleMock.address);
    await newChainlinkLightClient.deployed()
    expect(await newChainlinkLightClient.GATEWAY()).to.equal(gateway.address)
  })

  it("requestQuery() - invalid caller", async function () {
    const slots = getSlots()

    const queryRequests: QueryType.QueryRequestStruct[] = [
      { dstChainId: DSTCHAINID, to: SRC, height: HEIGTH, slot: slots[0] },
      { dstChainId: DSTCHAINID, to: SRC, height: HEIGTH, slot: slots[1] }
    ]

    expect(chainlinkLightClient.requestQuery(queryRequests)).to.be.revertedWithCustomError(chainlinkLightClient, "NotAuthorized")
  })

  it("requestQuery() - Too many queries", async function () {
    const slots = getSlots()

    const queryRequests: QueryType.QueryRequestStruct[] = []
    for (let i = 0; i < 11; i++) {
      queryRequests.push({ dstChainId: DSTCHAINID, to: SRC, height: HEIGTH, slot: slots[0] })
    }

    await expect(chainlinkLightClientMock.requestQuery(queryRequests)).to.be.revertedWith("Futaba: Too many queries")
  })


  it("requestQuery()", async function () {
    const slots = getSlots()

    const queryRequests: QueryType.QueryRequestStruct[] = [
      { dstChainId: DSTCHAINID, to: SRC, height: HEIGTH, slot: slots[0] },
      { dstChainId: DSTCHAINID, to: SRC, height: HEIGTH, slot: slots[1] }
    ]

    const encodedQuery = defaultAbiCoder.encode(
      [
        "tuple(uint32 dstChainId, address to, uint256 height, bytes32 slot)[]",
      ],
      [queryRequests]
    );
    expect(chainlinkLightClientMock.requestQuery(queryRequests)).to.emit(chainlinkLightClient, "NotifyOracle")
      .withArgs(anyValue, oracleMock.address, encodedQuery);
  })

  it("updateHeader() - invalid oracle", async function () {
    expect(chainlinkLightClient.updateHeader(oracleResponses)).to.be.revertedWith("Futaba: only light client can call this function")
  })

  it("updateHeader()", async function () {
    const tx = await chainlinkLightClient.setOracle(owner.address)
    await tx.wait()

    expect(chainlinkLightClient.updateHeader(oracleResponses)).to.emit(chainlinkLightClient, "UpdateHeader").withArgs(oracleResponses[0]).to.emit(chainlinkLightClient, "UpdateHeader").withArgs(oracleResponses[1])
    for (const response of oracleResponses) {
      expect(await chainlinkLightClient.getApprovedStateRoot(response.dstChainId, response.height)).to.equal(response.root)
    }
  })

  it("verify() - invalid caller", async function () {
    await (await oracleMock.setClient(chainlinkLightClientMock.address)).wait()
    await updateHeaderForNode(oracleMock)
    const encodedProof = defaultAbiCoder.encode(
      [
        "tuple(bytes32 root, address account, bytes proof)",
        "tuple(bytes32 root, bytes32 path, bytes proof)[]",
      ],
      [ACCOUNT_PROOF, [STORAGE_PROOF]]
    );

    const proof = defaultAbiCoder.encode(
      ["tuple(uint32 dstChainId, uint256 height, bytes proof)[]"],
      [[{ dstChainId: DSTCHAINID_GOERLI, height: HEIGTH_GOERLI, proof: encodedProof }]])

    expect(chainlinkLightClient.verify(proof)).to.be.revertedWithCustomError(chainlinkLightClient, "NotAuthorized")
  })

  it("verify() - invald account proof", async function () {
    const tx = await chainlinkLightClientMock.setOracle(oracleMock.address)
    await tx.wait()

    await updateHeaderForNode(oracleMock)
    const accountProof = { ...ACCOUNT_PROOF }
    accountProof.account = ZERO_ADDRESS

    const encodedProof = defaultAbiCoder.encode(
      [
        "tuple(bytes32 root, address account, bytes proof)",
        "tuple(bytes32 root, bytes32 path, bytes proof)[]",
      ],
      [accountProof, [STORAGE_PROOF]]
    );

    const proof = defaultAbiCoder.encode(
      ["tuple(uint32 dstChainId, uint256 height, bytes proof)[]"],
      [[{ dstChainId: DSTCHAINID_GOERLI, height: HEIGTH_GOERLI, proof: encodedProof }]])

    expect(chainlinkLightClientMock.verify(proof)).to.be.revertedWith("Bad hash")
  })

  it("verify() - different trie roots", async function () {
    await updateHeaderForNode(oracleMock)
    const storageProof = { ...STORAGE_PROOF }
    let encodedProof = defaultAbiCoder.encode(
      [
        "tuple(bytes32 root, address account, bytes proof)",
        "tuple(bytes32 root, bytes32 path, bytes proof)[]",
      ],
      [ACCOUNT_PROOF, [storageProof]]
    );

    const proof = defaultAbiCoder.encode(
      ["tuple(uint32 dstChainId, uint256 height, bytes proof)[]"],
      [[{ dstChainId: DSTCHAINID_GOERLI, height: HEIGTH_GOERLI, proof: encodedProof }]])
    await chainlinkLightClientMock.verify(proof)

    storageProof.root = ethers.utils.formatBytes32String("0x12345")

    encodedProof = defaultAbiCoder.encode(
      [
        "tuple(bytes32 root, address account, bytes proof)",
        "tuple(bytes32 root, bytes32 path, bytes proof)[]",
      ],
      [ACCOUNT_PROOF, [storageProof]]
    );

    const changedProof = defaultAbiCoder.encode(
      ["tuple(uint32 dstChainId, uint256 height, bytes proof)[]"],
      [[{ dstChainId: DSTCHAINID_GOERLI, height: HEIGTH_GOERLI, proof: encodedProof }]])

    expect(chainlinkLightClientMock.verify(changedProof)).to.be.revertedWith("Futaba: verify - different trie roots")
  })
  it("verify() - invalid storage proof", async function () {
    await updateHeaderForNode(oracleMock)
    const storageProof = { ...STORAGE_PROOF }
    storageProof.path = ethers.utils.formatBytes32String("0x12345")
    const encodedProof = defaultAbiCoder.encode(
      [
        "tuple(bytes32 root, address account, bytes proof)",
        "tuple(bytes32 root, bytes32 path, bytes proof)[]",
      ],
      [ACCOUNT_PROOF, [storageProof]]
    );

    const proof = defaultAbiCoder.encode(
      ["tuple(uint32 dstChainId, uint256 height, bytes proof)[]"],
      [[{ dstChainId: DSTCHAINID_GOERLI, height: HEIGTH_GOERLI, proof: encodedProof }]])

    expect(chainlinkLightClientMock.verify(proof)).to.be.revertedWith("Bad hash")
  })

  it("verify()", async function () {
    await updateHeaderForNode(oracleMock)
    const encodedProof = defaultAbiCoder.encode(
      [
        "tuple(bytes32 root, address account, bytes proof)",
        "tuple(bytes32 root, bytes32 path, bytes proof)[]",
      ],
      [ACCOUNT_PROOF, [STORAGE_PROOF]]
    );

    const proof = defaultAbiCoder.encode(
      ["tuple(uint32 dstChainId, uint256 height, bytes proof)[]"],
      [[{ dstChainId: DSTCHAINID_GOERLI, height: HEIGTH_GOERLI, proof: encodedProof }]])

    expect(await chainlinkLightClientMock.callStatic.verify(proof)).to.deep.equal([
      true,
      [
        '0x000000000000000000000000000000000000000000000000000000001dcd6500'
      ]
    ])
  })

  it("verify() - zero value", async function () {
    await updateHeaderForNode(oracleMock)
    const encodedProof = defaultAbiCoder.encode(
      [
        "tuple(bytes32 root, address account, bytes proof)",
        "tuple(bytes32 root, bytes32 path, bytes proof)[]",
      ],
      [ACCOUNT_PROOF, [ZERO_VALUE_STORAGE_PROOF]]
    );

    const proof = defaultAbiCoder.encode(
      ["tuple(uint32 dstChainId, uint256 height, bytes proof)[]"],
      [[{ dstChainId: DSTCHAINID_GOERLI, height: HEIGTH_GOERLI, proof: encodedProof }]])

    expect(await chainlinkLightClientMock.callStatic.verify(proof)).to.deep.equal([
      true,
      [
        '0x0000000000000000000000000000000000000000000000000000000000000000'
      ]
    ])
  })

  it("setOracle() - zero address", async function () {
    expect(chainlinkLightClient.setOracle(ethers.constants.AddressZero)).to.be.revertedWithCustomError(chainlinkLightClient, "ZeroAddressNotAllowed")
  })

  it("setOracle() - onlyOwner", async function () {
    expect(chainlinkLightClientMock.connect(otherSingners[0]).setOracle(oracleMock.address)).to.be.revertedWith("Ownable: caller is not the owner")
  })

  it("setOracle()", async function () {
    expect(chainlinkLightClient.setOracle(oracleMock.address)).to.emit(chainlinkLightClient, "SetOracle").withArgs(oracleMock.address)
  })

  it("getOracle()", async function () {
    expect(await chainlinkLightClientMock.getOracle()).to.equal(oracleMock.address)
  })

  it("estimateFee()", async function () {
    const slots = getSlots()

    const queries: QueryType.QueryRequestStruct[] = [
      { dstChainId: DSTCHAINID, to: SRC, height: HEIGTH, slot: slots[0] },
      { dstChainId: DSTCHAINID, to: SRC, height: HEIGTH, slot: slots[1] }
    ]
    expect(await chainlinkLightClient.estimateFee(queries)).to.equal(0)
  })
})
