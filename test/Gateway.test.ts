import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ContractReceipt } from "ethers";
import { hexlify, hexZeroPad, toUtf8Bytes, parseEther, keccak256, solidityPack } from "ethers/lib/utils";
import { Gateway, LinkTokenMock, FunctionsMock, LightClientMock, ChainlinkLightClient, Operator, ReceiverMock, OracleTestMock } from "../typechain-types";
import { QueryType } from "../typechain-types/contracts/Gateway";
import { JOB_ID, SOURCE, ZERO_ADDRESS, TEST_CALLBACK_ADDRESS, MESSAGE, DSTCHAINID, HEIGTH, SRC, PROOF_FOR_FUNCTIONS, DSTCHAINID_GOERLI, HEIGTH_GOERLI, SRC_GOERLI } from "./utils/constants";
import { deployGatewayFixture } from "./utils/fixture";
import { getSlots } from "./utils/helper";
import { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";




describe("Gateway", async function () {
  let gateway: Gateway,
    linkToken: LinkTokenMock,
    functionMock: FunctionsMock,
    lcMock: LightClientMock,
    oracleMock: OracleTestMock,
    chainlinkLightClient: ChainlinkLightClient,
    operator: Operator,
    owner: SignerWithAddress,
    otherSigner: SignerWithAddress,
    receiverMock: ReceiverMock

  before(async () => {
    [owner, otherSigner] = await ethers.getSigners()
    gateway = (await loadFixture(deployGatewayFixture)).gateway
    const LinkTokenMock = await ethers.getContractFactory("LinkTokenMock")
    const linkMock = await LinkTokenMock.deploy()
    await linkMock.deployed()
    linkToken = linkMock

    const FunctionsMock = await ethers.getContractFactory("FunctionsMock")
    functionMock = await FunctionsMock.deploy()
    await functionMock.deployed()

    const LightClientMock = await ethers.getContractFactory("FunctionsLightClientMock")
    lcMock = await LightClientMock.deploy()
    await lcMock.deployed()

    const Operator = await ethers.getContractFactory("Operator")
    operator = await Operator.deploy(linkToken.address, owner.address)
    await operator.deployed()

    const ChainlinkLightClient = await ethers.getContractFactory("ChainlinkLightClient")
    chainlinkLightClient = await ChainlinkLightClient.deploy()
    await chainlinkLightClient.deployed()

    const OracleMock = await ethers.getContractFactory("OracleTestMock")
    const jobId = hexlify(hexZeroPad(toUtf8Bytes(JOB_ID), 32))
    oracleMock = await OracleMock.deploy(linkToken.address, jobId, operator.address, parseEther("0.1"), chainlinkLightClient.address);
    await oracleMock.deployed()

    const ReceiverMock = await ethers.getContractFactory("ReceiverMock")
    receiverMock = await ReceiverMock.deploy()
    await receiverMock.deployed()

    let tx = await lcMock.setOracle(functionMock.address)
    tx = await lcMock.setSubscriptionId(0)
    await tx.wait()
    tx = await lcMock.setSource(SOURCE)
    await tx.wait()
    tx = await functionMock.setLightClient(lcMock.address)
    await tx.wait()
    tx = await chainlinkLightClient.setOracle(oracleMock.address)
    await tx.wait()
    tx = await linkToken.mint(oracleMock.address, ethers.utils.parseEther("1000"))
    await tx.wait()
    tx = await chainlinkLightClient.addToWhitelist([owner.address])
    await tx.wait()
  });

  it("constructor()", async function () {
    const Gateway = await ethers.getContractFactory("Gateway")
    const newGateway = await Gateway.deploy()
    await newGateway.deployed()
    expect(await newGateway.nonce()).to.be.equal(1)
  })


  it("query() - invalid target client", async function () {
    const slots = getSlots()
    const src = ZERO_ADDRESS
    const callBack = TEST_CALLBACK_ADDRESS
    const lightClient = lcMock.address
    const message = MESSAGE

    const QueryRequests: QueryType.QueryRequestStruct[] = [
      { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[0] },
      { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[1] }
    ]
    await expect(gateway.query(QueryRequests, lightClient, callBack, message)).to.be.revertedWithCustomError(gateway, "ZeroAddress")
  })

  it("query() - invalid light client", async function () {
    const slots = getSlots()
    const src = SRC
    const callBack = TEST_CALLBACK_ADDRESS
    const lightClient = ZERO_ADDRESS
    const message = MESSAGE

    const QueryRequests: QueryType.QueryRequestStruct[] = [
      { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[0] },
      { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[1] }
    ]
    await expect(gateway.query(QueryRequests, lightClient, callBack, message)).to.be.revertedWithCustomError(gateway, "ZeroAddress")
  })

  it("query() - light client with no interface defined", async function () {
    const slots = getSlots()
    const src = SRC
    const callBack = TEST_CALLBACK_ADDRESS
    const lightClient = TEST_CALLBACK_ADDRESS
    const message = MESSAGE

    const QueryRequests: QueryType.QueryRequestStruct[] = [
      { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[0] },
      { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[1] }
    ]
    await expect(gateway.query(QueryRequests, lightClient, callBack, message)).to.be.reverted
  })

  it("query() - invalid callBack", async function () {
    const slots = getSlots()
    const src = SRC
    const callBack = ZERO_ADDRESS
    const lightClient = lcMock.address
    const message = MESSAGE

    const QueryRequests: QueryType.QueryRequestStruct[] = [
      { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[0] },
      { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[1] }
    ]
    await expect(gateway.query(QueryRequests, lightClient, callBack, message)).to.be.revertedWithCustomError(gateway, "ZeroAddress")
  })

  describe("When using Chainlink Functions", async function () {
    it("query() - single query", async function () {
      const slots = getSlots()
      const src = SRC
      const callBack = TEST_CALLBACK_ADDRESS
      const lightClient = lcMock.address
      const message = MESSAGE

      const QueryRequests: QueryType.QueryRequestStruct[] = [
        { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[0] },
        { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[1] }
      ]
      let tx = await gateway.query(QueryRequests, lightClient, callBack, message)
      const resTx: ContractReceipt = await tx.wait()
      const events = resTx.events

      if (events !== undefined) {
        const args = events[0].args
        if (args !== undefined) {
          expect(args.callBack).equal(callBack)
          expect(args.lightClient).equal(lightClient)
          expect(args.message).equal(message.toLowerCase())
          const decodedPayload = ethers.utils.defaultAbiCoder.decode(["address", "tuple(uint32, address, uint256, bytes32)[]", "bytes", "address"], args.packet)
          expect(decodedPayload[0]).equal(callBack)
          expect(decodedPayload[2]).equal(message.toLowerCase())
          expect(decodedPayload[3]).equal(lightClient)

          for (let i = 0; i < decodedPayload[1].length; i++) {
            const requestQuery = QueryRequests[i]
            const query = decodedPayload[1][i];
            expect(query[0]).equal(requestQuery.dstChainId)
            expect(query[1]).equal(requestQuery.to)
            expect(query[2]).equal(requestQuery.height)
            expect(query[3]).equal(requestQuery.slot)
          }
        }
      }
    })
  })

  describe("When using Chainlink Node Operator", async function () {
    it("query()", async function () {
      const slots = getSlots()
      const src = SRC
      const callBack = TEST_CALLBACK_ADDRESS
      const lightClient = chainlinkLightClient.address
      const message = MESSAGE

      const queries: QueryType.QueryRequestStruct[] = [
        { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[0] },
        { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[1] }
      ]
      const encodedQuery = ethers.utils.defaultAbiCoder.encode(["address", "tuple(uint32 dstChainId, address to, uint256 height, bytes32 slot)[]", "bytes", "address"], [callBack, queries, message, lightClient])

      // calculate queryId
      const nonce = await gateway.nonce()
      const queryId = keccak256(solidityPack(["bytes", "uint64"], [encodedQuery, nonce]))

      let tx = gateway.query(queries, lightClient, callBack, message)
      await expect(tx).to.emit(gateway, "Packet").withArgs(owner.address, queryId, encodedQuery, message.toLowerCase(), lightClient, callBack);

      const oracle = await chainlinkLightClient.getOracle()
      const requests = []

      // Formatted to check Oracle events
      for (const request of queries) {
        requests.push({ dstChainId: request.dstChainId, height: request.height })
      }

      const encodedRequest = ethers.utils.defaultAbiCoder.encode(["tuple(uint32 dstChainId, uint256 height)[]"], [requests])
      await expect(tx).to.emit(chainlinkLightClient, "NotifyOracle").withArgs(anyValue, oracle, encodedRequest);

      const query = await gateway.queryStore(queryId)
      expect(query.data).to.be.equal(encodedQuery)
      expect(query.status).to.be.equal(0)

      expect(await gateway.nonce()).to.be.equal(nonce.add(1))
    })
  })

  // Process of pre-executing a request for a query
  async function requestQueryWithChainlinkNode() {
    const slots = getSlots()
    const src = SRC_GOERLI
    const callBack = receiverMock.address
    const lightClient = chainlinkLightClient.address
    const message = MESSAGE

    const QueryRequests: QueryType.QueryRequestStruct[] = [
      { dstChainId: DSTCHAINID_GOERLI, to: src, height: HEIGTH_GOERLI, slot: slots[0] },
      { dstChainId: DSTCHAINID_GOERLI, to: src, height: HEIGTH_GOERLI, slot: slots[1] }
    ]
    const amount = ethers.utils.parseEther("10")
    const tx = await gateway.query(QueryRequests, lightClient, callBack, message, { value: amount })
    const resTx: ContractReceipt = await tx.wait()
    const events = resTx.events
    let queryId = ""
    if (events !== undefined) {
      queryId = events[0].args?.queryId
    }

    return { queryId, amount }
  }

  it("estimateFee()", async function () {
    const slots = getSlots()
    const queries: QueryType.QueryRequestStruct[] = [
      { dstChainId: DSTCHAINID, to: SRC, height: HEIGTH, slot: slots[0] },
      { dstChainId: DSTCHAINID, to: SRC, height: HEIGTH, slot: slots[1] }
    ]
    expect(await gateway.estimateFee(chainlinkLightClient.address, queries)).to.be.equal(0)
  })

  it("withdraw() - onlyOwner", async function () {
    const { amount } = await requestQueryWithChainlinkNode()
    const balance = await gateway.provider.getBalance(gateway.address)
    expect(balance).to.be.equal(amount)

    await expect(gateway.connect(otherSigner).withdraw()).to.be.revertedWith("Ownable: caller is not the owner")

  })

  it("withdraw()", async function () {
    const balance = await gateway.provider.getBalance(gateway.address)
    await expect(gateway.connect(owner).withdraw()).to.emit(gateway, "Withdraw").withArgs(owner.address, balance);

    const newBalance = await gateway.provider.getBalance(gateway.address)
    expect(newBalance).to.be.equal(0)
  })

  it("receiveQuery() - onlyGelatoRelayERC2771", async function () {
    const queryResponse: QueryType.QueryResponseStruct = {
      queryId: hexZeroPad(ZERO_ADDRESS, 32), proof: PROOF_FOR_FUNCTIONS
    }
    await expect(gateway.receiveQuery(queryResponse)).to.be.revertedWith("onlyGelatoRelayERC2771")
  })

})
