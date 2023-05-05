import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers"
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs"
import { expect, use } from "chai"
import { ethers } from "hardhat"
import { RLP, concat, defaultAbiCoder, formatEther, hexZeroPad, keccak256 } from "ethers/lib/utils"
import { BigNumber, ContractReceipt } from "ethers"
import { Alchemy, Network } from "alchemy-sdk"
import * as dotenv from 'dotenv'
//@ts-ignore
import { GetProof } from 'eth-proof'
import { getAccountProof, getSlots, getStorageProof, setup, updateHeaderForFunctions, updateHeaderForNode } from "./utils/helper"
import { Gateway, QueryType } from "../typechain-types/contracts/Gateway"
import { DSTCHAINID, DSTCHAINID_GOERLI, HEIGTH, HEIGTH_GOERLI, MESSAGE, MULTI_QUERY_PROOF, MULTI_VALUE_PROOF, PROOF, SINGLE_VALUE_PROOF, SOURCE, SRC, SRC_GOERLI, TEST_CALLBACK_ADDRESS, TEST_LIGHT_CLIENT_ADDRESS } from "./utils/constants"
import { deployFunctionMockFixture, deployGatewayFixture, deployLightClientMockFixture, deployReceiverMockFixture } from "./utils/fixture"
import { ChainlinkMock, FunctionsMock, LightClientMock, LinkTokenMock, Operator, OracleMock } from "../typechain-types"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
dotenv.config()


describe("Gateway", async function () {
  let linkToken: LinkTokenMock,
    functionMock: FunctionsMock,
    lcMock: LightClientMock,
    oracleMock: OracleMock,
    chainlinkMock: ChainlinkMock,
    operator: Operator,
    owner: SignerWithAddress

  before(async () => {
    [owner] = await ethers.getSigners()
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

    const OracleMock = await ethers.getContractFactory("OracleMock")
    oracleMock = await OracleMock.deploy(linkToken.address)
    await oracleMock.deployed()

    const ChainlinkMock = await ethers.getContractFactory("ChainlinkMock")
    chainlinkMock = await ChainlinkMock.deploy()
    await chainlinkMock.deployed()

    const Operator = await ethers.getContractFactory("Operator")
    operator = await Operator.deploy(linkToken.address, owner.address)
    await operator.deployed()

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

  describe("When using Chainlink Functions", async function () {
    it("query()", async function () {
      const { gateway } = await loadFixture(deployGatewayFixture)

      const slots = getSlots()
      const src = SRC
      const callBack = TEST_CALLBACK_ADDRESS
      const lightClient = lcMock.address
      const message = MESSAGE
      const QueryRequests: QueryType.QueryRequestStruct[] = [
        { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[0] },
        // { dstChainId: 80001, to: src, height: 32130734, slot: slots[1] }
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
      const { gateway } = await loadFixture(deployGatewayFixture)
      const slots = getSlots()

      const ReceiverMock = await ethers.getContractFactory("ReceiverMock")
      const receiverMock = await ReceiverMock.deploy()
      await receiverMock.deployed()
      await updateHeaderForFunctions(functionMock)

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

      // relayer action
      if (events !== undefined) {
        const args = events[0].args
        if (args !== undefined) {
          const queryId = args.queryId

          const queryResponse: QueryType.QueryResponseStruct = {
            queryId, proof: PROOF
          }
          await expect(gateway.receiveQuery(queryResponse)).to.emit(gateway, "SaveResult").to.emit(gateway, "ReceiveQuery")

        }
      }
    })
  })

  describe("When using Chainlink Node Operator", async function () {
    it("query()", async function () {
      const { gateway } = await loadFixture(deployGatewayFixture)

      const slots = getSlots()
      const src = SRC
      const callBack = TEST_CALLBACK_ADDRESS
      const lightClient = chainlinkMock.address
      const message = MESSAGE
      const QueryRequests: QueryType.QueryRequestStruct[] = [
        { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[0] },
        // { dstChainId: 80001, to: src, height: 32130734, slot: slots[1] }
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
      const { gateway } = await loadFixture(deployGatewayFixture)
      const slots = getSlots()

      const ReceiverMock = await ethers.getContractFactory("ReceiverMock")
      const receiverMock = await ReceiverMock.deploy()
      await receiverMock.deployed()

      const src = SRC_GOERLI
      const callBack = receiverMock.address
      const lightClient = chainlinkMock.address
      const message = MESSAGE
      const QueryRequests: QueryType.QueryRequestStruct[] = [
        { dstChainId: DSTCHAINID_GOERLI, to: src, height: HEIGTH_GOERLI, slot: slots[0] }
      ]
      let tx = await gateway.query(QueryRequests, lightClient, callBack, message)
      const resTx: ContractReceipt = await tx.wait()
      const events = resTx.events

      if (events !== undefined) {
        // oracle action
        const oracleTopics = events[1].topics
        if (oracleTopics !== undefined) {
          const requestId = oracleTopics[1]
          await updateHeaderForNode(oracleMock, requestId)
        }

        // relayer action
        const queryArgs = events[0].args
        if (queryArgs !== undefined) {
          const queryId = queryArgs.queryId

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

        }
      }
    })
  })
})
