import { ChainlinkMock, OracleMock, LinkTokenMock, Operator, OracleTestMock } from "../typechain-types"
import { ethers } from "hardhat"
import { QueryType } from "../typechain-types/contracts/Gateway"
import { ACCOUNT_PROOF, DSTCHAINID, DSTCHAINID_GOERLI, HEIGTH, HEIGTH_GOERLI, JOB_ID, SRC, STORAGE_PROOF, ZERO_ADDRESS, ZERO_VALUE_STORAGE_PROOF } from "./utils/constants"
import { getSlots, updateHeaderForNode } from "./utils/helper"
import { expect } from "chai"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { defaultAbiCoder } from "@ethersproject/abi"
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs"
import { hexlify, hexZeroPad, toUtf8Bytes, parseEther } from "ethers/lib/utils"

describe("ChainlinkMock", async function () {
  let chainlinkMock: ChainlinkMock,
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

    const OracleMock = await ethers.getContractFactory("OracleTestMock")
    const jobId = hexlify(hexZeroPad(toUtf8Bytes(JOB_ID), 32))
    oracleMock = await OracleMock.deploy(linkToken.address, jobId, operator.address, parseEther("0.1"), chainlinkMock.address);
    await oracleMock.deployed()

    let tx = await chainlinkMock.setOracle(oracleMock.address)
    await tx.wait()
    tx = await oracleMock.setClient(chainlinkMock.address)
    await tx.wait()
    tx = await linkToken.mint(oracleMock.address, ethers.utils.parseEther("1000"))
    await tx.wait()
  })

  async function setWhiteList() {
    await chainlinkMock.connect(owner).addToWhitelist([owner.address])
  }

  it("addToWhitelist() - only owner", async function () {
    await expect(chainlinkMock.connect(otherSingners[0]).addToWhitelist([owner.address])).to.be.revertedWith("Ownable: caller is not the owner")
  })

  it("addToWhitelist()", async function () {
    const addresses = [...otherSingners.map(signer => signer.address)]
    await expect(chainlinkMock.connect(owner).addToWhitelist(addresses)).to.emit(chainlinkMock, "AddWhitelist").withArgs(addresses)
  })

  it("removeFromWhitelist() - only owner", async function () {
    await expect(chainlinkMock.connect(otherSingners[0]).removeFromWhitelist([owner.address])).to.be.revertedWith("Ownable: caller is not the owner")
  })

  it("removeFromWhitelist()", async function () {
    const addresses = [...otherSingners.map(signer => signer.address)]
    await expect(chainlinkMock.connect(owner).removeFromWhitelist(addresses)).to.emit(chainlinkMock, "RemoveWhitelist").withArgs(addresses)
  })
  it("requestQuery() - Too many queries", async function () {
    await setWhiteList()
    const slots = getSlots()

    const queryRequests: QueryType.QueryRequestStruct[] = []
    for (let i = 0; i < 11; i++) {
      queryRequests.push({ dstChainId: DSTCHAINID, to: SRC, height: HEIGTH, slot: slots[0] })
    }

    await expect(chainlinkMock.requestQuery(queryRequests)).to.be.revertedWith("Futaba: Too many queries")
  })
  it("requestQuery() - invalid sender address", async function () { })

  it("requestQuery()", async function () {
    await setWhiteList()
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
    for (const response of oracleResponses) {
      expect(await chainlinkMock.getApprovedStateRoot(response.dstChainId, response.height)).to.equal(response.root)
    }
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

    expect(await chainlinkMock.callStatic.verify(proof)).to.deep.equal([
      true,
      [
        '0x0000000000000000000000000000000000000000000000000000000000000000'
      ]
    ])
  })

  it("getOracle()", async function () {
    expect(await chainlinkMock.getOracle()).to.equal(oracleMock.address)
  })
  it("estimateFee()", async function () {
    const slots = getSlots()

    const queries: QueryType.QueryRequestStruct[] = [
      { dstChainId: DSTCHAINID, to: SRC, height: HEIGTH, slot: slots[0] },
      { dstChainId: DSTCHAINID, to: SRC, height: HEIGTH, slot: slots[1] }
    ]
    expect(await chainlinkMock.estimateFee(queries)).to.equal(0)
  })
})
