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
import { getAccountProof, getSlots, getStorageProof, setup, updateHeader } from "./utils/helper"
import { Gateway, QueryType } from "../typechain-types/contracts/Gateway"
import { DSTCHAINID, HEIGTH, MESSAGE, PROOF, SOURCE, SRC, TEST_CALLBACK_ADDRESS, TEST_LIGHT_CLIENT_ADDRESS } from "./utils/constants"
import { deployFunctionMockFixture, deployGatewayFixture, deployLightClientMockFixture, deployReceiverMockFixture } from "./utils/fixture"
dotenv.config()


describe("Gateway", async function () {
  it("query()", async function () {
    const { owner, gateway } = await loadFixture(deployGatewayFixture)
    // @dev When implemented in fixture, the test did not pass
    const FunctionMock = await ethers.getContractFactory("FunctionsMock")
    const functionMock = await FunctionMock.deploy()
    await functionMock.deployed()

    const LightClientMock = await ethers.getContractFactory("LightClientMock")
    const lcMock = await LightClientMock.deploy()
    await lcMock.deployed()

    // @dev Initialization of each contract
    let tx = await lcMock.setOracle(functionMock.address)
    tx = await lcMock.setSubscriptionId(0)
    await tx.wait()
    tx = await lcMock.setSource(SOURCE)
    await tx.wait()
    tx = await functionMock.setLightClient(lcMock.address)

    const slots = getSlots()
    const src = SRC
    const callBack = TEST_CALLBACK_ADDRESS
    const lightClient = lcMock.address
    const message = MESSAGE
    const QueryRequests: QueryType.QueryRequestStruct[] = [
      { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[0] },
      // { dstChainId: 80001, to: src, height: 32130734, slot: slots[1] }
    ]
    tx = await gateway.query(QueryRequests, lightClient, callBack, message)
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

  async function requestQuery(gateway: Gateway, slots: string[]) {
    // @dev When implemented in fixture, the test did not pass
    const FunctionMock = await ethers.getContractFactory("FunctionsMock")
    const functionMock = await FunctionMock.deploy()
    await functionMock.deployed()

    const LightClientMock = await ethers.getContractFactory("LightClientMock")
    const lcMock = await LightClientMock.deploy()
    await lcMock.deployed()

    const ReceiverMock = await ethers.getContractFactory("ReceiverMock")
    const receiverMock = await ReceiverMock.deploy()
    await receiverMock.deployed()

    // @dev Initialization of each contract
    let tx = await lcMock.setOracle(functionMock.address)
    tx = await lcMock.setSubscriptionId(0)
    await tx.wait()
    tx = await lcMock.setSource(SOURCE)
    await tx.wait()
    tx = await functionMock.setLightClient(lcMock.address)
    await updateHeader(functionMock)

    const src = SRC
    const callBack = receiverMock.address
    const lightClient = lcMock.address
    const message = MESSAGE
    const QueryRequests: QueryType.QueryRequestStruct[] = [
      { dstChainId: DSTCHAINID, to: src, height: HEIGTH, slot: slots[0] }
    ]
    tx = await gateway.query(QueryRequests, lightClient, callBack, message)
    const resTx: ContractReceipt = await tx.wait()
    const events = resTx.events
    return { events, queries: QueryRequests, receiver: receiverMock.address }
  }

  it("receiveQuery()", async function () {
    const { gateway } = await loadFixture(deployGatewayFixture)
    const slots = getSlots()

    const { events, queries } = await requestQuery(gateway, slots)

    // relayer action
    if (events !== undefined) {
      const args = events[0].args
      if (args !== undefined) {
        const queryId = args.queryId

        // @dev get proof from infura
        // const endpoint = `https://sepolia.infura.io/v3/${process.env.ETHEREUM_SEPOLIA_API_KEY}`

        // const accountProof = await getAccountProof(endpoint, SRC, HEIGTH)

        // const storageProof = await getStorageProof(endpoint, SRC, HEIGTH, slots[0])

        // const proof = ethers.utils.defaultAbiCoder.encode(["tuple(bytes32 root, address account, bytes proof)", "tuple(bytes32 root, bytes32 path, bytes proof)[]"], [accountProof, [storageProof]])

        // const proofs = ethers.utils.defaultAbiCoder.encode(["tuple(uint32 dstChainId, uint256 height, bytes proof)[]"], [[{ dstChainId: queries[0].dstChainId, height: queries[0].height, proof: proof }]])

        const queryResponse: QueryType.QueryResponseStruct = {
          queryId, proof: PROOF
        }
        await expect(gateway.receiveQuery(queryResponse)).to.emit(gateway, "SaveResult").to.emit(gateway, "ReceiveQuery")

      }
    }
  })
})
