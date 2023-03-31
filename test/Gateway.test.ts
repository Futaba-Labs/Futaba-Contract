// import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers"
// import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs"
// import { expect } from "chai"
// import { ethers } from "hardhat"
// import { RLP, concat, defaultAbiCoder, hexZeroPad, keccak256 } from "ethers/lib/utils"
// import { BigNumber, ContractReceipt } from "ethers"
// import { Alchemy, Network } from "alchemy-sdk"
// import * as dotenv from 'dotenv'
// //@ts-ignore
// import { GetProof } from 'eth-proof'
// import { getAccountProof, getSlots, getStorageProof } from "./utils/helper"
// import { Gateway, QueryType } from "../typechain-types/contracts/Gateway"
// import { MESSAGE, SRC, TEST_CALLBACK_ADDRESS, TEST_LIGHT_CLIENT_ADDRESS } from "./utils/constants"
// import { deployGatewayFixture, deployLightClientMockFixture } from "./utils/fixture"
// dotenv.config()


// describe("Gateway", async function () {
//   // We define a fixture to reuse the same setup in every test.
//   // We use loadFixture to run this setup once, snapshot that state,
//   // and reset Hardhat Network to that snapshot in every test.

//   async function deployOracleMockFixture() {
//     // Contracts are deployed using the first signer/account by default
//     const [owner, otherAccount] = await ethers.getSigners()

//     const OracleMock = await ethers.getContractFactory("OracleMock")
//     const oracleMock = await OracleMock.deploy(SRC)

//     return { oracleMock, owner, otherAccount }
//   }

//   it("query()", async function () {
//     const { gateway } = await loadFixture(deployGatewayFixture)
//     const { lcMock } = await loadFixture(deployLightClientMockFixture)
//     const { oracleMock } = await loadFixture(deployOracleMockFixture)
//     let tx = await lcMock.setOracle(oracleMock.address)
//     await tx.wait()
//     tx = await oracleMock.setClient(lcMock.address)
//     const slots = getSlots()
//     const src = SRC
//     const callBack = TEST_CALLBACK_ADDRESS
//     const lightClient = lcMock.address
//     const message = MESSAGE
//     const QueryRequests: QueryType.QueryRequestStruct[] = [
//       { dstChainId: 5, to: src, height: 32130734, slot: slots[0] },
//       { dstChainId: 80001, to: src, height: 32130734, slot: slots[1] },
//     ]
//     tx = await gateway.query(QueryRequests, lightClient, callBack, message)
//     const resTx: ContractReceipt = await tx.wait()
//     const events = resTx.events

//     if (events !== undefined) {
//       const args = events[0].args
//       if (args !== undefined) {
//         expect(args.callBack).equal(callBack)
//         expect(args.lightClient).equal(lightClient)
//         expect(args.message).equal(message.toLowerCase())
//         const decodedPayload = ethers.utils.defaultAbiCoder.decode(["address", "tuple(uint32, address, uint256, bytes32)[]", "bytes", "address"], args.packet)
//         expect(decodedPayload[0]).equal(callBack)
//         expect(decodedPayload[2]).equal(message.toLowerCase())
//         expect(decodedPayload[3]).equal(lightClient)

//         for (let i = 0; i < decodedPayload[1].length; i++) {
//           const requestQuery = QueryRequests[i]
//           const query = decodedPayload[1][i];
//           expect(query[0]).equal(requestQuery.dstChainId)
//           expect(query[1]).equal(requestQuery.to)
//           expect(query[2]).equal(requestQuery.height)
//           expect(query[3]).equal(requestQuery.slot)
//         }
//       }
//     }
//   })

//   async function requestQuery(gateway: Gateway, slots: string[]) {
//     const { lcMock } = await loadFixture(deployLightClientMockFixture)
//     const src = SRC
//     const callBack = TEST_CALLBACK_ADDRESS
//     const lightClient = lcMock.address
//     const message = MESSAGE
//     const QueryRequests: QueryType.QueryRequestStruct[] = [
//       { dstChainId: 5, to: src, height: 8629032, slot: slots[0] }
//     ]
//     let tx = await gateway.query(QueryRequests, lightClient, callBack, message)
//     const resTx: ContractReceipt = await tx.wait()
//     const events = resTx.events
//     return { events, queries: QueryRequests }
//   }

//   it("receiveQuery()", async function () {
//     const { gateway } = await loadFixture(deployGatewayFixture)
//     const slots = getSlots()

//     const { events, queries } = await requestQuery(gateway, slots)

//     // relayer action
//     if (events !== undefined) {
//       const args = events[0].args
//       if (args !== undefined) {
//         const queryId = args.queryId
//         const lightClient = args.lightClient
//         const callBack = args.callBack
//         const packet = args.message

//         const accountProof = await getAccountProof(`https://eth-goerli.g.alchemy.com/v2/${process.env.ETHEREUM_GOERLI_API_KEY}`, SRC, 8629032)

//         const storageProof = await getStorageProof(`https://eth-goerli.g.alchemy.com/v2/${process.env.ETHEREUM_GOERLI_API_KEY}`, SRC, 8629032, slots[0])

//         console.log(`storageProof: ${JSON.stringify(storageProof)}`)

//         const proof = ethers.utils.defaultAbiCoder.encode(["tuple(bytes32 root, address account, bytes proof)", "tuple(bytes32 root, bytes32 path, bytes proof)[]"], [accountProof, [storageProof]])

//         const proofs = ethers.utils.defaultAbiCoder.encode(["tuple(uint32 dstChainId, uint256 height, bytes proof)[]"], [[{ dstChainId: queries[0].dstChainId, height: queries[0].height, proof: proof }]])

//         const queryResponse: QueryType.QueryResponseStruct = {
//           queryId, lightClient, callBack, packet, proof: proofs
//         }

//         //WARNING if we use gateway.receiveQuery(queryResponse) directly, it will fail
//         let tx = await gateway.receiveQuery(queryResponse)
//         const resTx: ContractReceipt = await tx.wait()
//         const events = resTx.events

//         console.log(resTx)

//       }
//     }

//   })
// })
