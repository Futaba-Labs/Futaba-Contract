import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ContractReceipt } from "ethers";
import { hexlify, hexZeroPad, toUtf8Bytes, parseEther } from "ethers/lib/utils";
import { GatewayMock, LinkTokenMock, FunctionsMock, LightClientMock, OracleMock, ChainlinkMock, Operator, ReceiverMock } from "../typechain-types";
import { QueryType } from "../typechain-types/contracts/Gateway";
import { JOB_ID, SOURCE, SRC, MESSAGE, DSTCHAINID, HEIGTH, SRC_GOERLI, DSTCHAINID_GOERLI, HEIGTH_GOERLI, ZERO_ADDRESS, PROOF_FOR_FUNCTIONS, SINGLE_VALUE_PROOF, MULTI_VALUE_PROOF, MULTI_QUERY_PROOF } from "./utils/constants";
import { deployGatewayMockFixture } from "./utils/fixture";
import { getSlots, updateHeaderForFunctions, updateHeaderForNode } from "./utils/helper";
import { ethers } from "hardhat";



describe("GatewayMockTest", async function () {
  let gatewayMock: GatewayMock,
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
    gatewayMock = (await loadFixture(deployGatewayMockFixture)).gateway
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
    const tx = await gatewayMock.query(QueryRequests, lightClient, callBack, message)
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
    const tx = await gatewayMock.query(QueryRequests, lightClient, callBack, message)
    const resTx: ContractReceipt = await tx.wait()
    const events = resTx.events
    let queryId = ""
    if (events !== undefined) {
      queryId = events[0].args?.queryId
    }

    return queryId
  }

  it("receiveQuery() - invalid query id", async function () {
    await requestQueryWithFunctions()
    const queryResponse: QueryType.QueryResponseStruct = {
      queryId: hexZeroPad(ZERO_ADDRESS, 32), proof: PROOF_FOR_FUNCTIONS
    }
    await expect(gatewayMock.receiveQuery(queryResponse)).to.be.revertedWithCustomError(gatewayMock, "InvalidQueryId")
  })

  describe("When using Chainlink Functions", async function () {
    it("receiveQuery()", async function () {
      const slots = getSlots()
      const src = SRC
      const callBack = receiverMock.address
      const lightClient = lcMock.address
      const message = MESSAGE
      const QueryRequests: QueryType.QueryRequestStruct[] = [
        { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[0] }
      ]
      let tx = await gatewayMock.query(QueryRequests, lightClient, callBack, message)
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
          await expect(gatewayMock.receiveQuery(queryResponse)).to.emit(gatewayMock, "SaveQueryData").to.emit(gatewayMock, "ReceiveQuery")

        }
      }
    })
  })

  describe("When using Chainlink Node Operator", async function () {
    // If queryId is wrong, status is Fail
    it("receiveQuery() - invalid query id", async function () { })

    // Is the lightclient address valid?
    it("receiveQuery() - invalid light client", async function () { })

    // If light client interface is not defined, does it result in an error
    it("receiveQuery() - invalid light client contract", async function () { })

    // Is the receiver address valid?
    it("receiveQuery() - invalid receiver", async function () { })

    // If the IReceiver is incorrect, does it result in an error
    // If there is an error in the receiver, is the data still saved?
    it("receiveQuery() - invalid receiver contract", async function () { })

    it("receiveQuery()", async function () {
      const queryId = await requestQueryWithChainlinkNode()

      // oracle action
      await updateHeaderForNode(oracleMock, ZERO_ADDRESS)

      // relayer action
      const queryResponseForSingleProof: QueryType.QueryResponseStruct = {
        queryId, proof: SINGLE_VALUE_PROOF
      }
      await expect(gatewayMock.receiveQuery(queryResponseForSingleProof, { gasLimit: 30000000 })).to.emit(gatewayMock, "SaveQueryData").to.emit(gatewayMock, "ReceiveQuery")

      const queryResponseForMultiProofs: QueryType.QueryResponseStruct = {
        queryId, proof: MULTI_VALUE_PROOF
      }
      await expect(gatewayMock.receiveQuery(queryResponseForMultiProofs, { gasLimit: 30000000 })).to.emit(gatewayMock, "SaveQueryData").to.emit(gatewayMock, "ReceiveQuery")

      const queryResponseForMultiQueryProofs: QueryType.QueryResponseStruct = {
        queryId, proof: MULTI_QUERY_PROOF
      }
      await expect(gatewayMock.receiveQuery(queryResponseForMultiQueryProofs, { gasLimit: 30000000 })).to.emit(gatewayMock, "SaveQueryData").to.emit(gatewayMock, "ReceiveQuery")

      /* TODO
        * Whether queryId is correct
        * Is the data stored correctly?
        * Can storeKey be calculated correctly?
        * Whether SaveQueryData events are emitted
        * Whether ReceiveQuery events are emitted
     */
    })
  })

  async function storeQueryResult(gateway: GatewayMock, queryLen: number) {
    const queryId = await requestQueryWithChainlinkNode()

    // oracle action
    await updateHeaderForNode(oracleMock, ZERO_ADDRESS)

    const queryResponseForMultiQueryProofs: QueryType.QueryResponseStruct = {
      queryId, proof: MULTI_QUERY_PROOF
    }

    const tx = await gateway.receiveQuery(queryResponseForMultiQueryProofs, { gasLimit: 30000000 })
    const resTx: ContractReceipt = await tx.wait()

    const events = resTx.events

    const results = []
    if (events !== undefined) {
      for (let i = 0; i < queryLen; i++) {
        const event = events[i]
        const args = event.args
        if (args !== undefined) {
          results.push(args.result)
        }
      }
    }

    return results
  }

  it("getCache() - a specific block height", async function () {
    const slots = getSlots()
    const src = SRC_GOERLI
    const queryRequests: QueryType.QueryRequestStruct[] = [
      { dstChainId: DSTCHAINID_GOERLI, to: src, height: HEIGTH_GOERLI, slot: slots[0] },
      { dstChainId: DSTCHAINID_GOERLI, to: src, height: HEIGTH_GOERLI, slot: slots[1] }
    ]

    const results = await storeQueryResult(gatewayMock, queryRequests.length)

    /*
      * Does the number of requests match the number of results?
      * Are we deriving data for the correct storeKey?
     */

    expect(await gatewayMock.getCache(queryRequests)).deep.equal(results)
  })
  it("getCache() - latest block height", async function () {
    const slots = getSlots()
    const src = SRC_GOERLI
    const queryRequests: QueryType.QueryRequestStruct[] = [
      { dstChainId: DSTCHAINID_GOERLI, to: src, height: 0, slot: slots[0] },
      { dstChainId: DSTCHAINID_GOERLI, to: src, height: 0, slot: slots[1] }
    ]

    const results = await storeQueryResult(gatewayMock, queryRequests.length)

    /*
      * Does the number of requests match the number of results?
      * Are we deriving data for the correct storeKey?
     */

    expect(await gatewayMock.getCache(queryRequests)).deep.equal(results)
  })
  it("getCache() - zero value", async function () {
    const slots = getSlots()
    const src = SRC_GOERLI
    const queryRequests: QueryType.QueryRequestStruct[] = [
      { dstChainId: DSTCHAINID_GOERLI, to: src, height: 1, slot: slots[0] },
      { dstChainId: DSTCHAINID_GOERLI, to: src, height: 1, slot: slots[1] }
    ]

    await storeQueryResult(gatewayMock, queryRequests.length)

    expect(await gatewayMock.getCache(queryRequests)).deep.equal(["0x", "0x"])
  })
})
