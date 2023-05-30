import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ContractReceipt } from "ethers";
import { hexlify, hexZeroPad, toUtf8Bytes, parseEther, keccak256 } from "ethers/lib/utils";
import { Gateway, LinkTokenMock, FunctionsMock, LightClientMock, OracleMock, ChainlinkMock, Operator, ReceiverMock } from "../typechain-types";
import { QueryType } from "../typechain-types/contracts/Gateway";
import { JOB_ID, SOURCE, ZERO_ADDRESS, TEST_CALLBACK_ADDRESS, MESSAGE, DSTCHAINID, HEIGTH, SRC, PROOF_FOR_FUNCTIONS } from "./utils/constants";
import { deployGatewayFixture } from "./utils/fixture";
import { getSlots } from "./utils/helper";
import { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import exp from "constants";




describe("Gateway", async function () {
  let gateway: Gateway,
    linkToken: LinkTokenMock,
    functionMock: FunctionsMock,
    lcMock: LightClientMock,
    oracleMock: OracleMock,
    chainlinkMock: ChainlinkMock,
    operator: Operator,
    owner: SignerWithAddress,
    receiverMock: ReceiverMock

  before(async () => {
    [owner] = await ethers.getSigners()
    gateway = (await loadFixture(deployGatewayFixture)).gateway
    const LinkTokenMock = await ethers.getContractFactory("LinkTokenMock")
    const linkMock = await LinkTokenMock.deploy()
    await linkMock.deployed()
    linkToken = linkMock

    const FunctionsMock = await ethers.getContractFactory("FunctionsMock")
    functionMock = await FunctionsMock.deploy()
    await functionMock.deployed()

    const LightClientMock = await ethers.getContractFactory("LightClientMock")
    lcMock = await LightClientMock.deploy()
    await lcMock.deployed()

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
    tx = await chainlinkMock.setOracle(oracleMock.address)
    await tx.wait()
    tx = await oracleMock.setClient(chainlinkMock.address)
    await tx.wait()
    tx = await linkToken.mint(oracleMock.address, ethers.utils.parseEther("1000"))
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
    await expect(gateway.query(QueryRequests, lightClient, callBack, message)).to.be.revertedWith("Futaba: Invalid target contract zero address")
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
    await expect(gateway.query(QueryRequests, lightClient, callBack, message)).to.be.revertedWith("Futaba: Invalid light client contract")
  })

  it("query() - invalid callback", async function () {
    const slots = getSlots()
    const src = SRC
    const callBack = ZERO_ADDRESS
    const lightClient = lcMock.address
    const message = MESSAGE

    const QueryRequests: QueryType.QueryRequestStruct[] = [
      { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[0] },
      { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[1] }
    ]
    await expect(gateway.query(QueryRequests, lightClient, callBack, message)).to.be.revertedWith("Futaba: Invalid callback contract")
  })

  it("receiveQuery() - onlyGelatoRelayERC2771", async function () {
    const queryResponse: QueryType.QueryResponseStruct = {
      queryId: hexZeroPad(ZERO_ADDRESS, 32), proof: PROOF_FOR_FUNCTIONS
    }
    await expect(gateway.receiveQuery(queryResponse)).to.be.revertedWith("onlyGelatoRelayERC2771")
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
      const lightClient = chainlinkMock.address
      const message = MESSAGE

      const QueryRequests: QueryType.QueryRequestStruct[] = [
        { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[0] },
        { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[1] }
      ]
      const encodedQuery = ethers.utils.defaultAbiCoder.encode(["address", "tuple(uint32 dstChainId, address to, uint256 height, bytes32 slot)[]", "bytes", "address"], [callBack, QueryRequests, message, lightClient])

      const nonce = await gateway.nonce()
      const queryId = keccak256(ethers.utils.defaultAbiCoder.encode(["bytes", "uint256"], [encodedQuery, nonce]))

      let tx = gateway.query(QueryRequests, lightClient, callBack, message)
      await expect(tx).to.emit(gateway, "Packet").withArgs(owner.address, queryId, encodedQuery, message.toLowerCase(), lightClient, callBack);

      const oracle = await chainlinkMock.getOracle()
      const requests = []

      for (const request of QueryRequests) {
        requests.push({ dstChainId: request.dstChainId, height: request.height })
      }

      const encodedRequest = ethers.utils.defaultAbiCoder.encode(["tuple(uint32 dstChainId, uint256 height)[]"], [requests])
      await expect(tx).to.emit(chainlinkMock, "NotifyOracle").withArgs(anyValue, oracle, encodedRequest);

      const query = await gateway.queryStore(queryId)
      expect(query.data).to.be.equal(encodedQuery)
      expect(query.status).to.be.equal(0)

      expect(await gateway.nonce()).to.be.equal(nonce.add(1))
    })
  })
})
