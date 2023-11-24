import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, ContractReceipt } from "ethers";
import { hexlify, hexZeroPad, toUtf8Bytes, parseEther, keccak256, solidityPack } from "ethers/lib/utils";
import { GatewayMock, LinkTokenMock, FunctionsMock, ChainlinkLightClient, Operator, ReceiverMock, OracleTestMock, FunctionsLightClientMock } from "../typechain-types";
import { QueryType } from "../typechain-types/contracts/Gateway";
import { JOB_ID, SOURCE, SRC, MESSAGE, DSTCHAINID, HEIGTH, SRC_GOERLI, DSTCHAINID_GOERLI, HEIGTH_GOERLI, ZERO_ADDRESS, PROOF_FOR_FUNCTIONS, SINGLE_VALUE_PROOF, MULTI_VALUE_PROOF, GREATER_THAN_32BYTES_PROOF } from "./utils/constants";
import { deployGatewayMockFixture } from "./utils/fixture";
import { getSlots, updateHeaderForFunctions, updateHeaderForNode } from "./utils/helper";
import { ethers } from "hardhat";

interface QueryParam {
  queries: QueryType.QueryRequestStruct[]
  proof: string
}
// Test when Gelato process is skipped
describe("GatewayMockTest", async function () {
  let gatewayMock: GatewayMock,
    linkToken: LinkTokenMock,
    functionMock: FunctionsMock,
    lcMock: FunctionsLightClientMock,
    oracleMock: OracleTestMock,
    chainlinkLightClient: ChainlinkLightClient,
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

    const LightClientMock = await ethers.getContractFactory("FunctionsLightClientMock")
    lcMock = await LightClientMock.deploy()
    await lcMock.deployed()

    const Operator = await ethers.getContractFactory("Operator")
    operator = await Operator.deploy(linkToken.address, owner.address)
    await operator.deployed()

    const OracleMock = await ethers.getContractFactory("OracleTestMock")
    const jobId = hexlify(hexZeroPad(toUtf8Bytes(JOB_ID), 32))
    oracleMock = await OracleMock.deploy(linkToken.address, jobId, operator.address, parseEther("0.1"), operator.address);
    await oracleMock.deployed()

    const ChainlinkLightClient = await ethers.getContractFactory("ChainlinkLightClient")
    chainlinkLightClient = await ChainlinkLightClient.deploy(gatewayMock.address, oracleMock.address)
    await chainlinkLightClient.deployed()

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
    tx = await linkToken.mint(oracleMock.address, ethers.utils.parseEther("1000"))
    await tx.wait()
    tx = await oracleMock.setClient(chainlinkLightClient.address)
    await tx.wait()
  });

  async function requestQueryWithFunctions() {
    const slots = getSlots()
    const src = SRC
    const callBack = receiverMock.address
    const lightClient = lcMock.address
    const message = MESSAGE

    const queries: QueryType.QueryRequestStruct[] = [
      { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[0] },
      { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[1] }
    ]
    const tx = await gatewayMock.query(queries, lightClient, callBack, message, { value: BigNumber.from(20000) })
    const resTx: ContractReceipt = await tx.wait()
    const events = resTx.events
    let queryId = ""
    if (events !== undefined) {
      queryId = events[0].args?.queryId
    }

    return queryId
  }

  // Process of pre-executing a request for a query
  async function requestQueryWithChainlinkNode(callBack: string = receiverMock.address, lightClient: string = chainlinkLightClient.address, message: string = MESSAGE, queries: QueryType.QueryRequestStruct[] = []) {
    const slots = getSlots()
    const src = SRC_GOERLI

    if (queries.length === 0) {
      queries.push({ dstChainId: DSTCHAINID_GOERLI, to: src, height: HEIGTH_GOERLI, slot: slots[0] })
      queries.push({ dstChainId: DSTCHAINID_GOERLI, to: src, height: HEIGTH_GOERLI, slot: slots[1] })
    }

    const tx = await gatewayMock.query(queries, lightClient, callBack, message, { value: BigNumber.from(20000) })
    const resTx: ContractReceipt = await tx.wait()
    const events = resTx.events
    let queryId = ""
    if (events !== undefined) {
      queryId = events[0].args?.queryId
    }

    return { queryId, queries, callBack, lightClient, message }
  }

  async function storeQueryResult(gateway: GatewayMock, param: QueryParam) {
    const { queryId } = await requestQueryWithChainlinkNode(undefined, undefined, undefined, param.queries)

    // oracle action
    await updateHeaderForNode(oracleMock, ZERO_ADDRESS)


    const queryResponseForMultiQueryProofs: QueryType.QueryResponseStruct = {
      queryId, proof: param.proof
    }

    const tx = await gateway.receiveQuery(queryResponseForMultiQueryProofs, { gasLimit: 30000000 })
    const resTx: ContractReceipt = await tx.wait()

    const events = resTx.events

    const results = []
    if (events !== undefined) {
      for (let i = 0; i < param.queries.length; i++) {
        const event = events[i]
        const args = event.args
        if (args !== undefined) {
          results.push(args.result)
        }
      }
    }

    return { queryId, results }
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
      const queries: QueryType.QueryRequestStruct[] = [
        { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[0] }
      ]
      let tx = await gatewayMock.query(queries, lightClient, callBack, message, { value: BigNumber.from(20000) })
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
    it("receiveQuery() - invalid fee", async function () {
      const slots = getSlots()
      const src = SRC_GOERLI

      const queries = [{ dstChainId: DSTCHAINID_GOERLI, to: src, height: HEIGTH_GOERLI, slot: slots[0] }, { dstChainId: DSTCHAINID_GOERLI, to: src, height: HEIGTH_GOERLI, slot: slots[1] }]

      const callBack = receiverMock.address
      const lightClient = lcMock.address
      const message = MESSAGE

      await expect(gatewayMock.query(queries, lightClient, callBack, message)).to.be.revertedWithCustomError(gatewayMock, "InvalidFee")
    })

    it("receiveQuery() - invalid query id", async function () {
      const queryId = await requestQueryWithChainlinkNode()
      const invalidQueryId = hexZeroPad(ZERO_ADDRESS, 32)
      expect(queryId).to.not.equal(invalidQueryId)

      const queryResponse: QueryType.QueryResponseStruct = {
        queryId: invalidQueryId, proof: SINGLE_VALUE_PROOF.proof
      }

      await expect(gatewayMock.receiveQuery(queryResponse)).to.be.revertedWithCustomError(gatewayMock, "InvalidQueryId").withArgs(invalidQueryId)
    })

    it("receiveQuery() - invalid status", async function () {
      const { queryId } = await storeQueryResult(gatewayMock, { queries: SINGLE_VALUE_PROOF.queries, proof: SINGLE_VALUE_PROOF.proof })

      const queryResponse: QueryType.QueryResponseStruct = {
        queryId, proof: SINGLE_VALUE_PROOF.proof
      }

      await expect(gatewayMock.receiveQuery(queryResponse)).to.be.revertedWithCustomError(gatewayMock, "InvalidStatus").withArgs(1)
    })

    it("receiveQuery() - invalid receiver", async function () {
      const { queryId } = await requestQueryWithChainlinkNode(chainlinkLightClient.address)

      const queryResponse: QueryType.QueryResponseStruct = {
        queryId, proof: SINGLE_VALUE_PROOF.proof
      }
      await updateHeaderForNode(oracleMock, ZERO_ADDRESS)

      await expect(gatewayMock.receiveQuery(queryResponse)).to.be.reverted
    })

    it("receiveQuery() - errors in receiver", async function () {
      const ReceiverBadMock = await ethers.getContractFactory("ReceiverBadMock")
      const receiverBadMock = await ReceiverBadMock.deploy()
      await receiverBadMock.deployed()
      const { queryId, queries } = await requestQueryWithChainlinkNode(receiverBadMock.address)

      const queryResponse: QueryType.QueryResponseStruct = {
        queryId, proof: SINGLE_VALUE_PROOF.proof
      }
      const results = SINGLE_VALUE_PROOF.results
      const storeKey = keccak256(solidityPack(["uint256", "address", "bytes32"], [queries[0].dstChainId, queries[0].to, queries[0].slot]))
      await updateHeaderForNode(oracleMock, ZERO_ADDRESS)

      await expect(gatewayMock.receiveQuery(queryResponse)).to.emit(gatewayMock, "SaveQueryData").withArgs(storeKey, queries[0].height, results[0]).to.emit(gatewayMock, "ReceiverError").withArgs(queryId, toUtf8Bytes("Futaba: ReceiverBadMock"))

      // check query status
      expect(await gatewayMock.getQueryStatus(queryId)).to.be.equal(2)
    })

    it("receiveQuery() - single value", async function () {
      const { queryId, queries, callBack, lightClient, message } = await requestQueryWithChainlinkNode(undefined, undefined, undefined, SINGLE_VALUE_PROOF.queries)

      // oracle action
      await updateHeaderForNode(oracleMock, ZERO_ADDRESS)

      // relayer action
      const queryResponseForSingleProof: QueryType.QueryResponseStruct = {
        queryId, proof: SINGLE_VALUE_PROOF.proof
      }
      const results = SINGLE_VALUE_PROOF.results
      const storeKey = keccak256(solidityPack(["uint256", "address", "bytes32"], [queries[0].dstChainId, queries[0].to, queries[0].slot]))

      await expect(gatewayMock.receiveQuery(queryResponseForSingleProof, { gasLimit: 30000000 })).to.emit(gatewayMock, "SaveQueryData").withArgs(storeKey, queries[0].height, results[0]).to.emit(gatewayMock, "ReceiveQuery").withArgs(queryId, message.toLowerCase(), lightClient, callBack, results)

      // check query status
      expect(await gatewayMock.getQueryStatus(queryId)).to.be.equal(1)
    })

    it("receiveQuery() - single value greater than 32 bytes", async function () {
      const { queryId, queries, callBack, lightClient, message } = await requestQueryWithChainlinkNode(undefined, undefined, undefined, SINGLE_VALUE_PROOF.queries)

      // oracle action
      await updateHeaderForNode(oracleMock, ZERO_ADDRESS)

      // relayer action
      const queryResponseForSingleProof: QueryType.QueryResponseStruct = {
        queryId, proof: GREATER_THAN_32BYTES_PROOF.proof
      }
      const results = GREATER_THAN_32BYTES_PROOF.results
      const storeKey = keccak256(solidityPack(["uint256", "address", "bytes32"], [queries[0].dstChainId, queries[0].to, queries[0].slot]))

      await expect(gatewayMock.receiveQuery(queryResponseForSingleProof, { gasLimit: 30000000 })).to.emit(gatewayMock, "SaveQueryData").withArgs(storeKey, queries[0].height, results[0]).to.emit(gatewayMock, "ReceiveQuery").withArgs(queryId, message.toLowerCase(), lightClient, callBack, results)

      // check query status
      expect(await gatewayMock.getQueryStatus(queryId)).to.be.equal(1)
    })

    it("receiveQuery() - multiple values", async function () {
      const { queryId, queries, callBack, lightClient, message } = await requestQueryWithChainlinkNode(undefined, undefined, undefined, MULTI_VALUE_PROOF.queries)

      // oracle action
      await updateHeaderForNode(oracleMock, ZERO_ADDRESS)

      const queryResponseForMultiQueryProofs: QueryType.QueryResponseStruct = {
        queryId, proof: MULTI_VALUE_PROOF.proof
      }

      const results = MULTI_VALUE_PROOF.results

      const tx = gatewayMock.receiveQuery(queryResponseForMultiQueryProofs, { gasLimit: 30000000 })

      for (let i = 0; i < results.length; i++) {
        const storeKey = keccak256(solidityPack(["uint256", "address", "bytes32"], [queries[i].dstChainId, queries[i].to, queries[i].slot]))
        await expect(tx).to.emit(gatewayMock, "SaveQueryData").withArgs(storeKey, queries[i].height, results[i])
      }

      await expect(tx).to.emit(gatewayMock, "ReceiveQuery").withArgs(queryId, message.toLowerCase(), lightClient, callBack, results)

      // check query status
      expect(await gatewayMock.getQueryStatus(queryId)).to.be.equal(1)
    })
  })

  it("getCache() - a specific block height", async function () {
    const queryRequests = MULTI_VALUE_PROOF.queries

    const { results } = await storeQueryResult(gatewayMock, { queries: MULTI_VALUE_PROOF.queries, proof: MULTI_VALUE_PROOF.proof })

    expect(await gatewayMock.getCache(queryRequests)).deep.equal(results)
  })
  it("getCache() - latest block height", async function () {
    const queryRequests = MULTI_VALUE_PROOF.queries
    for (const queryRequest of queryRequests) {
      queryRequest.height = 0
    }
    const { results } = await storeQueryResult(gatewayMock, { queries: MULTI_VALUE_PROOF.queries, proof: MULTI_VALUE_PROOF.proof })

    expect(await gatewayMock.getCache(queryRequests)).deep.equal(results)
  })
  it("getCache() - too many queries", async function () {
    let queryRequests: QueryType.QueryRequestStruct[] = []
    for (let i = 0; i < 50; i++) {
      queryRequests = [...queryRequests, MULTI_VALUE_PROOF.queries[0], MULTI_VALUE_PROOF.queries[1]]
    }
    await storeQueryResult(gatewayMock, { queries: MULTI_VALUE_PROOF.queries, proof: MULTI_VALUE_PROOF.proof })

    expect(await gatewayMock.getCache(queryRequests)).to.be.revertedWith("Futaba: Too many queries")
  })
  it("getCache() - zero value", async function () {
    const queryRequests = MULTI_VALUE_PROOF.queries
    await storeQueryResult(gatewayMock, { queries: MULTI_VALUE_PROOF.queries, proof: MULTI_VALUE_PROOF.proof })
    for (const queryRequest of queryRequests) {
      queryRequest.height = 100
    }

    expect(await gatewayMock.getCache(queryRequests)).deep.equal(["0x", "0x"])
  })
})
