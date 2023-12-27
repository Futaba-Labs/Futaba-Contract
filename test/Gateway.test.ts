import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, ContractReceipt } from "ethers";
import { ethers, upgrades } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { parseEther, hexlify, hexZeroPad, toUtf8Bytes, keccak256, solidityPack } from "ethers/lib/utils";
import { Gateway, LinkTokenMock, FunctionsMock, FunctionsLightClientMock, OracleTestMock, ChainlinkLightClient, Operator, ReceiverMock } from "../typechain-types";
import { QueryType } from "../typechain-types/contracts/Gateway";
import { GAS_DATA, JOB_ID, SOURCE, DSTCHAINID, SRC, HEIGTH, ZERO_ADDRESS, TEST_CALLBACK_ADDRESS, MESSAGE, SRC_GOERLI, DSTCHAINID_GOERLI, HEIGTH_GOERLI, SINGLE_VALUE_PROOF, GREATER_THAN_32BYTES_PROOF, MULTI_VALUE_PROOF, PROOF_FOR_FUNCTIONS } from "./utils/constants";
import { getSlots, updateHeaderForNode } from "./utils/helper";

type QueryParam = {
  queries: QueryType.QueryRequestStruct[]
  proof: string
}

describe("Gateway", async function () {
  const oracleFee = parseEther("0.1")
  const protocolFee = parseEther("0.1")
  const gasData = GAS_DATA

  let gateway: Gateway,
    linkToken: LinkTokenMock,
    functionMock: FunctionsMock,
    lcMock: FunctionsLightClientMock,
    oracleMock: OracleTestMock,
    chainlinkLightClient: ChainlinkLightClient,
    operator: Operator,
    owner: SignerWithAddress,
    otherSigner: SignerWithAddress,
    relayer: SignerWithAddress,
    others: SignerWithAddress[],
    receiverMock: ReceiverMock

  before(async () => {
    [owner, otherSigner, relayer, ...others] = await ethers.getSigners()

    const Gateway = await ethers.getContractFactory("Gateway")
    const g = await upgrades.deployProxy(Gateway, [1, protocolFee], { initializer: 'initialize', kind: 'uups' });
    await g.deployed()
    gateway = g as Gateway

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

    const AggregatorV3Mock = await ethers.getContractFactory("AggregatorV3Mock")
    const aggregatorV3Mock = await AggregatorV3Mock.deploy(8, "Gateway Test", 1, oracleFee)
    await aggregatorV3Mock.deployed()

    const ChainlinkLightClient = await ethers.getContractFactory("ChainlinkLightClient")
    chainlinkLightClient = await ChainlinkLightClient.deploy(gateway.address, oracleMock.address, aggregatorV3Mock.address, gasData.gasLimit, gasData.gasPrice, gasData.gasPerQuery)
    await chainlinkLightClient.deployed()

    const ReceiverMock = await ethers.getContractFactory("ReceiverMock")
    receiverMock = await ReceiverMock.deploy(gateway.address)
    await receiverMock.deployed()

    let tx = await lcMock.setOracle(functionMock.address)
    await tx.wait()
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
    tx = await gateway.setRelayers([relayer.address])
    await tx.wait()
  });

  it("deploy()", async function () {
    const Gateway = await ethers.getContractFactory("Gateway")
    const newGateway = await upgrades.deployProxy(Gateway, [1, protocolFee], { initializer: 'initialize', kind: 'uups' });
    await newGateway.deployed()
    expect(await newGateway.getNonce()).to.be.equal(1)
  })

  it("upgrade()", async function () {
    const Gateway = await ethers.getContractFactory("Gateway")
    const newGateway = await upgrades.deployProxy(Gateway, [2, protocolFee], { initializer: 'initialize', kind: 'uups' });
    await newGateway.deployed()
    expect(await newGateway.getNonce()).to.be.equal(2)

    await upgrades.upgradeProxy(newGateway, Gateway);

    expect(await newGateway.getNonce()).to.be.equal(2)
  })

  it("estimateFee() - invalid light client", async function () {
    const slots = getSlots()
    const queries: QueryType.QueryRequestStruct[] = [
      { dstChainId: DSTCHAINID, to: SRC, height: HEIGTH, slot: slots[0] },
      { dstChainId: DSTCHAINID, to: SRC, height: HEIGTH, slot: slots[1] }
    ]
    await expect(gateway.estimateFee(ZERO_ADDRESS, queries)).to.be.reverted
  })

  it("query() - no queries", async function () {
    const src = SRC
    const callBack = receiverMock.address
    const lightClient = lcMock.address
    const message = MESSAGE

    const QueryRequests: QueryType.QueryRequestStruct[] = []
    await expect(gateway.query(QueryRequests, lightClient, callBack, message)).to.be.revertedWithCustomError(gateway, "ZeroQuery")
  })

  it("query() - light client address is zero", async function () {
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

  it("query() - callBack address is zero", async function () {
    const slots = getSlots()
    const src = SRC
    const callBack = ZERO_ADDRESS
    const lightClient = chainlinkLightClient.address
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
    const callBack = receiverMock.address
    const lightClient = TEST_CALLBACK_ADDRESS
    const message = MESSAGE

    const QueryRequests: QueryType.QueryRequestStruct[] = [
      { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[0] },
      { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[1] }
    ]
    await expect(gateway.query(QueryRequests, lightClient, callBack, message)).to.be.reverted
  })

  it("query() - callBack with no interface defined", async function () {
    const slots = getSlots()
    const src = SRC
    const callBack = TEST_CALLBACK_ADDRESS
    const lightClient = chainlinkLightClient.address
    const message = MESSAGE

    const QueryRequests: QueryType.QueryRequestStruct[] = [
      { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[0] },
      { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[1] }
    ]
    await expect(gateway.query(QueryRequests, lightClient, callBack, message)).to.be.reverted
  })

  it("query() - invalid target contract", async function () {
    const slots = getSlots()
    const src = ZERO_ADDRESS
    const callBack = receiverMock.address
    const lightClient = lcMock.address
    const message = MESSAGE

    const QueryRequests: QueryType.QueryRequestStruct[] = [
      { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[0] },
      { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[1] }
    ]

    const fee = await gateway.estimateFee(lightClient, QueryRequests)
    await expect(gateway.query(QueryRequests, lightClient, callBack, message, { value: fee })).to.be.revertedWithCustomError(gateway, "ZeroAddress")
  })

  it("query() - invalid chainId", async function () {
    const slots = getSlots()
    const src = SRC
    const callBack = receiverMock.address
    const lightClient = lcMock.address
    const message = ethers.utils.toUtf8Bytes("")

    const QueryRequests: QueryType.QueryRequestStruct[] = [
      { dstChainId: 0, to: src, height: HEIGTH, slot: slots[0] },
      { dstChainId: 0, to: src, height: HEIGTH, slot: slots[1] }
    ]

    const fee = await gateway.estimateFee(lightClient, QueryRequests)
    await expect(gateway.query(QueryRequests, lightClient, callBack, message, { value: fee })).to.be.revertedWithCustomError(gateway, "InvalidInputZeroValue")
  })

  it("query() - invalid height", async function () {
    const slots = getSlots()
    const src = SRC
    const callBack = receiverMock.address
    const lightClient = lcMock.address
    const message = ethers.utils.toUtf8Bytes("")

    const QueryRequests: QueryType.QueryRequestStruct[] = [
      { dstChainId: DSTCHAINID, to: src, height: 0, slot: slots[0] },
      { dstChainId: DSTCHAINID, to: src, height: 0, slot: slots[1] }
    ]

    const fee = await gateway.estimateFee(lightClient, QueryRequests)
    await expect(gateway.query(QueryRequests, lightClient, callBack, message, { value: fee })).to.be.revertedWithCustomError(gateway, "InvalidInputZeroValue")
  })

  it("query() - invalid fee", async function () {
    const slots = getSlots()
    const src = SRC
    const callBack = receiverMock.address
    const lightClient = lcMock.address
    const message = ethers.utils.toUtf8Bytes("")

    const QueryRequests: QueryType.QueryRequestStruct[] = [
      { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[0] },
      { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[1] }
    ]
    await expect(gateway.query(QueryRequests, lightClient, callBack, message, { value: ethers.utils.parseEther("0.001") })).to.be.revertedWithCustomError(gateway, "InvalidFee")
  })

  describe("When using Chainlink Functions", async function () {
    it("query() - single query", async function () {
      const slots = getSlots()
      const src = SRC
      const callBack = receiverMock.address
      const lightClient = lcMock.address
      const message = MESSAGE

      const QueryRequests: QueryType.QueryRequestStruct[] = [
        { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[0] },
        { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[1] }
      ]
      const fee = await gateway.estimateFee(lightClient, QueryRequests)
      let tx = await gateway.query(QueryRequests, lightClient, callBack, message, { value: fee })
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
      const callBack = receiverMock.address
      const lightClient = chainlinkLightClient.address
      const message = MESSAGE

      const queries: QueryType.QueryRequestStruct[] = [
        { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[0] },
        { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[1] }
      ]
      const encodedQuery = ethers.utils.defaultAbiCoder.encode(["address", "tuple(uint32 dstChainId, address to, uint256 height, bytes32 slot)[]", "bytes", "address"], [callBack, queries, message, lightClient])

      // calculate queryId
      const nonce = await gateway.getNonce()
      const queryId = keccak256(solidityPack(["bytes", "uint256"], [encodedQuery, nonce]))

      const fee = await gateway.estimateFee(lightClient, queries)
      let tx = gateway.query(queries, lightClient, callBack, message, { value: fee })
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

      expect(await gateway.getNonce()).to.be.equal(nonce.add(1))

      // check query status
      expect(await gateway.getQueryStatus(queryId)).to.be.equal(0)
    })

    it("query() - no message", async function () {
      const slots = getSlots()
      const src = SRC
      const callBack = receiverMock.address
      const lightClient = chainlinkLightClient.address
      const emptyMessage = ethers.utils.toUtf8Bytes("");


      const queries: QueryType.QueryRequestStruct[] = [
        { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[0] },
        { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[1] }
      ]
      const encodedQuery = ethers.utils.defaultAbiCoder.encode(["address", "tuple(uint32 dstChainId, address to, uint256 height, bytes32 slot)[]", "bytes", "address"], [callBack, queries, emptyMessage, lightClient])

      // calculate queryId
      const nonce = await gateway.getNonce()
      const queryId = keccak256(solidityPack(["bytes", "uint256"], [encodedQuery, nonce]))

      const fee = await gateway.estimateFee(lightClient, queries)
      let tx = gateway.query(queries, lightClient, callBack, emptyMessage, { value: fee })
      await expect(tx).to.emit(gateway, "Packet").withArgs(owner.address, queryId, encodedQuery, ethers.utils.hexlify(emptyMessage).toLowerCase(), lightClient, callBack);

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

      expect(await gateway.getNonce()).to.be.equal(nonce.add(1))

      // check query status
      expect(await gateway.getQueryStatus(queryId)).to.be.equal(0)
    })
  })

  // Process of pre-executing a request for a query
  async function requestQueryWithChainlinkNode(callBack: string = receiverMock.address, lightClient: string = chainlinkLightClient.address, message: string = MESSAGE, queries: QueryType.QueryRequestStruct[] = []) {
    const slots = getSlots()
    const src = SRC_GOERLI

    if (queries.length === 0) {
      queries.push({ dstChainId: DSTCHAINID_GOERLI, to: src, height: HEIGTH_GOERLI, slot: slots[0] })
      queries.push({ dstChainId: DSTCHAINID_GOERLI, to: src, height: HEIGTH_GOERLI, slot: slots[1] })
    }

    const fee = parseEther("1")
    const tx = await gateway.query(queries, lightClient, callBack, message, { value: fee })
    const resTx: ContractReceipt = await tx.wait()
    const events = resTx.events
    let queryId = ""
    if (events !== undefined) {
      for (let i = 0; i < events.length; i++) {
        const eventName = "Packet"
        if (events[i].event === eventName) {
          queryId = events[i].args?.queryId
        }
      }
    }

    return { queryId, queries, callBack, lightClient, message, fee }
  }

  async function storeQueryResult(gateway: Gateway, param: QueryParam) {
    const { queryId } = await requestQueryWithChainlinkNode(undefined, undefined, undefined, param.queries)

    // oracle action
    await updateHeaderForNode(oracleMock, ZERO_ADDRESS)


    const queryResponseForMultiQueryProofs: QueryType.QueryResponseStruct = {
      queryId, proof: param.proof
    }

    const tx = await gateway.connect(relayer).receiveQuery(queryResponseForMultiQueryProofs, { gasLimit: 30000000 })
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
    const queryId = await requestQueryWithChainlinkNode()
    const invalidQueryId = hexZeroPad(ZERO_ADDRESS, 32)
    expect(queryId).to.not.equal(invalidQueryId)

    const queryResponse: QueryType.QueryResponseStruct = {
      queryId: invalidQueryId, proof: SINGLE_VALUE_PROOF.proof
    }

    await expect(gateway.connect(relayer).receiveQuery(queryResponse)).to.be.revertedWithCustomError(gateway, "InvalidQueryId").withArgs(invalidQueryId)
  })

  it("receiveQuery() - invalid status", async function () {
    const { queryId } = await storeQueryResult(gateway, { queries: SINGLE_VALUE_PROOF.queries, proof: SINGLE_VALUE_PROOF.proof })

    const queryResponse: QueryType.QueryResponseStruct = {
      queryId, proof: SINGLE_VALUE_PROOF.proof
    }

    await expect(gateway.connect(relayer).receiveQuery(queryResponse)).to.be.revertedWithCustomError(gateway, "InvalidStatus").withArgs(1)
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

    await expect(gateway.connect(relayer).receiveQuery(queryResponse)).to.emit(gateway, "SaveQueryData").withArgs(storeKey, queries[0].height, results[0]).to.emit(gateway, "ReceiverError").withArgs(queryId, toUtf8Bytes("Futaba: ReceiverBadMock"))

    // check query status
    expect(await gateway.getQueryStatus(queryId)).to.be.equal(2)
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

    await expect(gateway.connect(relayer).receiveQuery(queryResponseForSingleProof, { gasLimit: 30000000 })).to.emit(gateway, "SaveQueryData").withArgs(storeKey, queries[0].height, results[0]).to.emit(gateway, "ReceiveQuery").withArgs(queryId, message.toLowerCase(), lightClient, callBack, results)

    // check query status
    expect(await gateway.getQueryStatus(queryId)).to.be.equal(1)
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

    await expect(gateway.connect(relayer).receiveQuery(queryResponseForSingleProof, { gasLimit: 30000000 })).to.emit(gateway, "SaveQueryData").withArgs(storeKey, queries[0].height, results[0]).to.emit(gateway, "ReceiveQuery").withArgs(queryId, message.toLowerCase(), lightClient, callBack, results)

    // check query status
    expect(await gateway.getQueryStatus(queryId)).to.be.equal(1)
  })

  it("receiveQuery() - multiple values", async function () {
    const { queryId, queries, callBack, lightClient, message } = await requestQueryWithChainlinkNode(undefined, undefined, undefined, MULTI_VALUE_PROOF.queries)

    // oracle action
    await updateHeaderForNode(oracleMock, ZERO_ADDRESS)

    const queryResponseForMultiQueryProofs: QueryType.QueryResponseStruct = {
      queryId, proof: MULTI_VALUE_PROOF.proof
    }

    const results = MULTI_VALUE_PROOF.results

    const tx = gateway.connect(relayer).receiveQuery(queryResponseForMultiQueryProofs, { gasLimit: 30000000 })

    for (let i = 0; i < results.length; i++) {
      const storeKey = keccak256(solidityPack(["uint256", "address", "bytes32"], [queries[i].dstChainId, queries[i].to, queries[i].slot]))
      await expect(tx).to.emit(gateway, "SaveQueryData").withArgs(storeKey, queries[i].height, results[i])
    }

    await expect(tx).to.emit(gateway, "ReceiveQuery").withArgs(queryId, message.toLowerCase(), lightClient, callBack, results)

    // check query status
    expect(await gateway.getQueryStatus(queryId)).to.be.equal(1)
  })

  it("getCache() - a specific block height", async function () {
    const queryRequests = [...MULTI_VALUE_PROOF.queries]
    const { results } = await storeQueryResult(gateway, { queries: queryRequests, proof: MULTI_VALUE_PROOF.proof })

    expect(await gateway.getCache(queryRequests)).deep.equal(results)
  })

  it("getCache() - latest block height", async function () {
    const queryRequests = []
    const { results } = await storeQueryResult(gateway, { queries: MULTI_VALUE_PROOF.queries, proof: MULTI_VALUE_PROOF.proof })
    for (const query of MULTI_VALUE_PROOF.queries) {
      queryRequests.push({ ...query, height: 0 })
    }
    expect(await gateway.getCache(queryRequests)).deep.equal(results)
  })

  it("getCache() - too many queries", async function () {
    let queryRequests: QueryType.QueryRequestStruct[] = []
    await storeQueryResult(gateway, { queries: MULTI_VALUE_PROOF.queries, proof: MULTI_VALUE_PROOF.proof })
    for (let i = 0; i < 101; i++) {
      queryRequests = [...queryRequests, MULTI_VALUE_PROOF.queries[0], MULTI_VALUE_PROOF.queries[1]]
    }

    expect(gateway.getCache(queryRequests)).to.be.revertedWithCustomError(gateway, "TooManyQueries")
  })

  it("getCache() - zero value", async function () {
    const queryRequests = []
    await storeQueryResult(gateway, { queries: MULTI_VALUE_PROOF.queries, proof: MULTI_VALUE_PROOF.proof })
    for (const query of MULTI_VALUE_PROOF.queries) {
      queryRequests.push({ ...query, height: 100 })
    }

    expect(await gateway.getCache(queryRequests)).deep.equal(["0x", "0x"])
  })

  it("estimateFee()", async function () {
    const slots = getSlots()
    const queries: QueryType.QueryRequestStruct[] = [
      { dstChainId: DSTCHAINID, to: SRC, height: HEIGTH, slot: slots[0] },
      { dstChainId: DSTCHAINID, to: SRC, height: HEIGTH, slot: slots[1] }
    ]

    // calc fee
    const fee = (BigNumber.from(queries.length).mul(gasData.gasPerQuery).add(gasData.gasLimit)).mul(gasData.gasPrice).add(oracleFee).add(protocolFee)
    expect(await gateway.estimateFee(chainlinkLightClient.address, queries)).to.be.equal(fee)
  })

  it("withdraw() - onlyOwner", async function () {
    await expect(gateway.connect(otherSigner).withdraw()).to.be.revertedWith("Ownable: caller is not the owner")
  })

  it("withdraw()", async function () {
    const balance = await gateway.provider.getBalance(gateway.address)
    await expect(gateway.connect(owner).withdraw()).to.emit(gateway, "Withdraw").withArgs(owner.address, balance);

    const newBalance = await gateway.provider.getBalance(gateway.address)
    expect(newBalance).to.be.equal(0)
  })

  it("receiveQuery() - invalid relayer", async function () {
    const queryResponse: QueryType.QueryResponseStruct = {
      queryId: hexZeroPad(ZERO_ADDRESS, 32), proof: PROOF_FOR_FUNCTIONS
    }
    await expect(gateway.receiveQuery(queryResponse)).to.be.revertedWithCustomError(gateway, "InvalidRelayer")
  })

  it("setRelayers() - onlyOwner", async function () {
    const relayers = [relayer.address]
    await expect(gateway.connect(otherSigner).setRelayers(relayers)).to.be.revertedWith("Ownable: caller is not the owner")
  })

  it("setRelayers() - too many relayers", async function () {
    const relayers = []
    for (let i = 0; i < 11; i++) {
      relayers.push(others[i].address)
    }
    await expect(gateway.setRelayers(relayers)).to.be.revertedWithCustomError(gateway, "TooManyRelayers")
  })

  it("setRelayers()", async function () {
    const relayers = [relayer.address]
    await expect(gateway.setRelayers(relayers)).to.emit(gateway, "SetRelayer").withArgs(owner.address, relayer.address);
  })

  it("addRelayers() - onlyOwner", async function () {
    const relayers = [relayer.address]
    await expect(gateway.connect(otherSigner).removeRelayers(relayers)).to.be.revertedWith("Ownable: caller is not the owner")
  })

  it("removeRelayers() - too many relayers", async function () {
    const relayers = []
    for (let i = 0; i < 11; i++) {
      relayers.push(others[i].address)
    }
    await expect(gateway.removeRelayers(relayers)).to.be.revertedWithCustomError(gateway, "TooManyRelayers")
  })

  it("removeRelayers()", async function () {
    const relayers = [relayer.address]
    await (await gateway.setRelayers(relayers)).wait()
    await expect(gateway.removeRelayers(relayers)).to.emit(gateway, "RemoveRelayer").withArgs(owner.address, relayer.address);
  })

})
