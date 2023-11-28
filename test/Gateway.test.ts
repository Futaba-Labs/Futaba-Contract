import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ContractReceipt } from "ethers";
import { hexlify, hexZeroPad, toUtf8Bytes, parseEther, keccak256, solidityPack } from "ethers/lib/utils";
import { Gateway, LinkTokenMock, FunctionsMock, ChainlinkLightClient, Operator, ReceiverMock, OracleTestMock, FunctionsLightClientMock } from "../typechain-types";
import { QueryType } from "../typechain-types/contracts/Gateway";
import { JOB_ID, SOURCE, ZERO_ADDRESS, TEST_CALLBACK_ADDRESS, MESSAGE, DSTCHAINID, HEIGTH, SRC, PROOF_FOR_FUNCTIONS, DSTCHAINID_GOERLI, HEIGTH_GOERLI, SRC_GOERLI } from "./utils/constants";
import { getSlots } from "./utils/helper";
import { ethers, upgrades } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";




describe("Gateway", async function () {
  let gateway: Gateway,
    linkToken: LinkTokenMock,
    functionMock: FunctionsMock,
    lcMock: FunctionsLightClientMock,
    oracleMock: OracleTestMock,
    chainlinkLightClient: ChainlinkLightClient,
    operator: Operator,
    owner: SignerWithAddress,
    otherSigner: SignerWithAddress,
    receiverMock: ReceiverMock

  before(async () => {
    [owner, otherSigner] = await ethers.getSigners()

    const Gateway = await ethers.getContractFactory("Gateway")
    const g = await upgrades.deployProxy(Gateway, [1], { initializer: 'initialize', kind: 'uups' });
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

    const ChainlinkLightClient = await ethers.getContractFactory("ChainlinkLightClient")
    chainlinkLightClient = await ChainlinkLightClient.deploy(gateway.address, oracleMock.address)
    await chainlinkLightClient.deployed()

    const ReceiverMock = await ethers.getContractFactory("ReceiverMock")
    receiverMock = await ReceiverMock.deploy()
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
  });

  it("deploy()", async function () {
    const Gateway = await ethers.getContractFactory("Gateway")
    const newGateway = await upgrades.deployProxy(Gateway, [1], { initializer: 'initialize', kind: 'uups' });
    await newGateway.deployed()
    expect(await newGateway.getNonce()).to.be.equal(1)
  })

  it("upgrade()", async function () {
    const Gateway = await ethers.getContractFactory("Gateway")
    const newGateway = await upgrades.deployProxy(Gateway, [2], { initializer: 'initialize', kind: 'uups' });
    await newGateway.deployed()
    expect(await newGateway.getNonce()).to.be.equal(2)

    await upgrades.upgradeProxy(newGateway, Gateway);

    expect(await newGateway.getNonce()).to.be.equal(2)
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
    await expect(gateway.query(QueryRequests, lightClient, callBack, message)).to.be.revertedWithCustomError(gateway, "ZeroAddress")
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
    await expect(gateway.query(QueryRequests, lightClient, callBack, message)).to.be.revertedWithCustomError(gateway, "InvalidInputZeroValue")
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
    await expect(gateway.query(QueryRequests, lightClient, callBack, message)).to.be.revertedWithCustomError(gateway, "InvalidInputZeroValue")
  })

  it("query() - invalid slot", async function () {
    const src = SRC
    const callBack = receiverMock.address
    const lightClient = lcMock.address
    const message = ethers.utils.toUtf8Bytes("")
    const emptySlot = ethers.utils.formatBytes32String("")

    const QueryRequests: QueryType.QueryRequestStruct[] = [
      { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: emptySlot },
      {
        dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: emptySlot
      }
    ]
    await expect(gateway.query(QueryRequests, lightClient, callBack, message)).to.be.revertedWithCustomError(gateway, "InvalidInputEmptyBytes32")
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
      const queryId = keccak256(solidityPack(["bytes", "uint64"], [encodedQuery, nonce]))

      let tx = gateway.query(queries, lightClient, callBack, emptyMessage)
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
