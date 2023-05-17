import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import * as dotenv from 'dotenv'
import { LinkTokenMock, FunctionsMock, LightClientMock, OracleMock, ChainlinkMock, Operator, GatewayMock, ReceiverMock } from '../typechain-types';
import { Gateway, QueryType } from '../typechain-types/contracts/Gateway';
import { SOURCE, SRC, TEST_CALLBACK_ADDRESS, MESSAGE, DSTCHAINID, HEIGTH, PROOF_FOR_FUNCTIONS, SRC_GOERLI, DSTCHAINID_GOERLI, HEIGTH_GOERLI, SINGLE_VALUE_PROOF, MULTI_VALUE_PROOF, MULTI_QUERY_PROOF, ZERO_ADDRESS } from './utils/constants';
import { deployGatewayFixture, deployGatewayMockFixture } from './utils/fixture';
import { getSlots, updateHeaderForFunctions, updateHeaderForNode } from './utils/helper';
import { ethers } from 'hardhat';
import { ContractReceipt } from 'ethers';
import { hexZeroPad } from 'ethers/lib/utils';

dotenv.config()


describe("Gateway", async function () {
  let gateway: Gateway | GatewayMock,
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

    const OracleMock = await ethers.getContractFactory("OracleTestMock")
    oracleMock = await OracleMock.deploy(linkToken.address)
    await oracleMock.deployed()

    const ChainlinkMock = await ethers.getContractFactory("ChainlinkMock")
    chainlinkMock = await ChainlinkMock.deploy()
    await chainlinkMock.deployed()

    const Operator = await ethers.getContractFactory("Operator")
    operator = await Operator.deploy(linkToken.address, owner.address)
    await operator.deployed()

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
    tx = await oracleMock.setOracle(operator.address)
    await tx.wait()
    tx = await linkToken.mint(oracleMock.address, ethers.utils.parseEther("1000"))
    await tx.wait()

  });

  async function requestQueryWithFunctions() {
    const slots = getSlots()
    const src = SRC
    const callBack = receiverMock.address
    const lightClient = lcMock.address
    const message = MESSAGE

    const QueryRequests: QueryType.QueryRequestStruct[] = [
      { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[0] },
      { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[1] }
    ]
    const tx = await gateway.query(QueryRequests, lightClient, callBack, message)
    const resTx: ContractReceipt = await tx.wait()
    const events = resTx.events
    let queryId = ""
    if (events !== undefined) {
      queryId = events[0].args?.queryId
    }

    return queryId
  }

  async function requestQueryWithChainlinkNode() {
    const slots = getSlots()
    const src = SRC_GOERLI
    const callBack = receiverMock.address
    const lightClient = chainlinkMock.address
    const message = MESSAGE

    const QueryRequests: QueryType.QueryRequestStruct[] = [
      { dstChainId: DSTCHAINID_GOERLI, to: src, height: HEIGTH_GOERLI, slot: slots[0] },
      { dstChainId: DSTCHAINID_GOERLI, to: src, height: HEIGTH_GOERLI, slot: slots[1] }
    ]
    const tx = await gateway.query(QueryRequests, lightClient, callBack, message)
    const resTx: ContractReceipt = await tx.wait()
    const events = resTx.events
    let queryId = ""
    if (events !== undefined) {
      queryId = events[0].args?.queryId
    }

    return queryId
  }

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

  it("query() - onlyGelatoRelay", async function () {
    const queryResponse: QueryType.QueryResponseStruct = {
      queryId: hexZeroPad(ZERO_ADDRESS, 32), proof: PROOF_FOR_FUNCTIONS
    }
    await expect(gateway.receiveQuery(queryResponse)).to.be.revertedWith("onlyGelatoRelay")
  })

  it("receiveQuery() - invalid query id", async function () {
    gateway = (await loadFixture(deployGatewayMockFixture)).gateway
    await requestQueryWithFunctions()
    const queryResponse: QueryType.QueryResponseStruct = {
      queryId: hexZeroPad(ZERO_ADDRESS, 32), proof: PROOF_FOR_FUNCTIONS
    }
    await expect(gateway.receiveQuery(queryResponse)).to.be.revertedWithCustomError(gateway, "InvalidQueryId")
  })

  describe("When using Chainlink Functions", async function () {
    it("query() - single query", async function () {
      const slots = getSlots()
      const src = SRC
      const callBack = TEST_CALLBACK_ADDRESS
      const lightClient = lcMock.address
      const message = MESSAGE

      //TODO: need to set up mutiple query
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

    //@dev need to remove `onlyGelatoRelay` and `_transferRelayFee()` from `receiveQuery()`
    it("receiveQuery()", async function () {
      const slots = getSlots()
      const src = SRC
      const callBack = receiverMock.address
      const lightClient = lcMock.address
      const message = MESSAGE
      const QueryRequests: QueryType.QueryRequestStruct[] = [
        { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[0] }
      ]
      let tx = await gateway.query(QueryRequests, lightClient, callBack, message)
      const resTx: ContractReceipt = await tx.wait()
      const events = resTx.events

      // oracle action
      await updateHeaderForFunctions(functionMock)

      // relayer action
      if (events !== undefined) {
        const args = events[0].args
        if (args !== undefined) {
          const queryId = args.queryId

          const queryResponse: QueryType.QueryResponseStruct = {
            queryId, proof: PROOF_FOR_FUNCTIONS
          }
          await expect(gateway.receiveQuery(queryResponse)).to.emit(gateway, "SaveResult").to.emit(gateway, "ReceiveQuery")

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

    it("receiveQuery()", async function () {
      gateway = (await loadFixture(deployGatewayMockFixture)).gateway
      const queryId = await requestQueryWithChainlinkNode()

      // oracle action
      await updateHeaderForNode(oracleMock, ZERO_ADDRESS)

      // relayer action
      const queryResponseForSingleProof: QueryType.QueryResponseStruct = {
        queryId, proof: SINGLE_VALUE_PROOF
      }
      await expect(gateway.receiveQuery(queryResponseForSingleProof, { gasLimit: 30000000 })).to.emit(gateway, "SaveResult").to.emit(gateway, "ReceiveQuery")

      const queryResponseForMultiProofs: QueryType.QueryResponseStruct = {
        queryId, proof: MULTI_VALUE_PROOF
      }
      await expect(gateway.receiveQuery(queryResponseForMultiProofs, { gasLimit: 30000000 })).to.emit(gateway, "SaveResult").to.emit(gateway, "ReceiveQuery")

      const queryResponseForMultiQueryProofs: QueryType.QueryResponseStruct = {
        queryId, proof: MULTI_QUERY_PROOF
      }
      await expect(gateway.receiveQuery(queryResponseForMultiQueryProofs, { gasLimit: 30000000 })).to.emit(gateway, "SaveResult").to.emit(gateway, "ReceiveQuery")
    })
  })
})
