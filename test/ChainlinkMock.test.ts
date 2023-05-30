import { loadFixture } from "@nomicfoundation/hardhat-network-helpers"
import { ChainlinkMock, OracleMock, LinkTokenMock, Operator } from "../typechain-types"
import { ethers } from "hardhat"
import { src } from "../typechain-types/@chainlink/contracts"
import { QueryType } from "../typechain-types/contracts/Gateway"
import { ACCOUNT_PROOF, DSTCHAINID, DSTCHAINID_GOERLI, HEIGTH, HEIGTH_GOERLI, JOB_ID, SRC, STORAGE_PROOF, ZERO_ADDRESS, ZERO_VALUE_STORAGE_PROOF } from "./utils/constants"
import { getSlots, updateHeaderForNode } from "./utils/helper"
import { expect } from "chai"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { defaultAbiCoder } from "@ethersproject/abi"
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs"
import { encode } from "punycode"
import { hexlify, hexZeroPad, toUtf8Bytes, parseEther } from "ethers/lib/utils"

describe("ChainlinkMock", async function () {
  let chainlinkMock: ChainlinkMock,
    oracleMock: OracleMock,
    linkToken: LinkTokenMock,
    operator: Operator,
    owner: SignerWithAddress

  const oracleResponses = [
    { dstChainId: DSTCHAINID, height: HEIGTH, root: ethers.utils.formatBytes32String("0x1234") },
    { dstChainId: DSTCHAINID, height: HEIGTH_GOERLI, root: ethers.utils.formatBytes32String("0x12345") },
  ]


  before(async function () {
    [owner] = await ethers.getSigners()
    const LinkTokenMock = await ethers.getContractFactory("LinkTokenMock")
    const linkMock = await LinkTokenMock.deploy()
    await linkMock.deployed()
    linkToken = linkMock

    const Operator = await ethers.getContractFactory("Operator")
    operator = await Operator.deploy(linkToken.address, owner.address)
    await operator.deployed()

    const OracleMock = await ethers.getContractFactory("OracleTestMock")
    const jobId = hexlify(hexZeroPad(toUtf8Bytes(JOB_ID), 32))
    oracleMock = await OracleMock.deploy(linkToken.address, jobId, operator.address, parseEther("0.1"));
    await oracleMock.deployed()

    const ChainlinkMock = await ethers.getContractFactory("ChainlinkMock")
    chainlinkMock = await ChainlinkMock.deploy()
    await chainlinkMock.deployed()

    let tx = await chainlinkMock.setOracle(oracleMock.address)
    await tx.wait()
    tx = await oracleMock.setClient(chainlinkMock.address)
    await tx.wait()
    tx = await linkToken.mint(oracleMock.address, ethers.utils.parseEther("1000"))
    await tx.wait()
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
    expect(chainlinkMock.requestQuery(queryRequests)).to.emit(chainlinkMock, "NotifyOracle")
      .withArgs(anyValue, oracleMock.address, encodedQuery);
  })

  it("updateHeader() - invalid oracle", async function () {
    expect(chainlinkMock.updateHeader(oracleResponses)).to.be.revertedWith("Futaba: only light client can call this function")
  })

  it("updateHeader()", async function () {
    const tx = await chainlinkMock.setOracle(owner.address)
    await tx.wait()

    expect(chainlinkMock.updateHeader(oracleResponses)).to.emit(chainlinkMock, "UpdateHeader").withArgs(oracleResponses[0]).to.emit(chainlinkMock, "UpdateHeader").withArgs(oracleResponses[1])
  })

  it("verify() - invald account proof", async function () {
    const tx = await chainlinkMock.setOracle(oracleMock.address)
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

    expect(chainlinkMock.verify(proof)).to.be.revertedWith("Bad hash")
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
    const tx = await chainlinkMock.verify(proof)
    await tx.wait()

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

    expect(chainlinkMock.verify(changedProof)).to.be.revertedWith("Futaba: verify - different trie roots")
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

    expect(chainlinkMock.verify(proof)).to.be.revertedWith("Bad hash")
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

    expect(await chainlinkMock.callStatic.verify(proof)).to.deep.equal([
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

    const tx = await chainlinkMock.verify(proof)
    await tx.wait()

    // expect(await chainlinkMock.callStatic.verify(proof)).to.deep.equal([
    //   true,
    //   [
    //     '0x000000000000000000000000000000000000000000000000000000001dcd6500'
    //   ]
    // ])
  })
})
