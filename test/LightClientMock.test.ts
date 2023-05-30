import { loadFixture } from "@nomicfoundation/hardhat-network-helpers"
import { expect } from "chai"
import { deployFunctionMockFixture, deployLightClientMockFixture } from "./utils/fixture"
import { SAMPLEQUERIES, SOURCE, SRC } from "./utils/constants"
import { LightClientMock } from "../typechain-types"
import { QueryType } from "../typechain-types/contracts/mock/LightClientMock"
import { getAccountProof, getSlots, getStorageProof } from "./utils/helper"

import * as dotenv from 'dotenv'
import { ethers } from "hardhat"
import { ContractReceipt } from "ethers/lib/ethers"
dotenv.config()

//@dev This function is currently not in use
describe("LightClientMock", async function () {
  it("setSubscriptionId()", async function () {
    const { lcMock } = await loadFixture(deployLightClientMockFixture)
    const tx = await lcMock.setSubscriptionId(1)
    const resTx = await tx.wait()
    const events = resTx.events
    if (events !== undefined) {
      const args = events[0].args
      if (args !== undefined) {
        expect(args.subscriptionId).to.equal(1)
      }
    }
  })
  it("setProviderURL()", async function () {
    const { lcMock } = await loadFixture(deployLightClientMockFixture)
    const tx = await lcMock.setProviderURL(11155111, "https://polygon-mumbai.infura.io/v3")
    const resTx = await tx.wait()
    const events = resTx.events
    if (events !== undefined) {
      const args = events[0].args
      if (args !== undefined) {
        expect(args.chainId).to.equal(11155111)
        expect(args.url).to.equal("https://polygon-mumbai.infura.io/v3")
      }
    }
  })
  it("setSource()", async function () {
    const { lcMock } = await loadFixture(deployLightClientMockFixture)
    const tx = await lcMock.setSource(SOURCE)
    const resTx = await tx.wait()
    const events = resTx.events
    if (events !== undefined) {
      const args = events[0].args
      if (args !== undefined) {
        expect(args.source).to.equal(SOURCE)
      }
    }
  })

  it("setOracle()", async function () {
    const { lcMock } = await loadFixture(deployLightClientMockFixture)
    const FunctionMock = await ethers.getContractFactory("FunctionsMock")
    const functionMock = await FunctionMock.deploy()
    await functionMock.deployed()
    const tx = await lcMock.setOracle(functionMock.address)
    const resTx = await tx.wait()
    const events = resTx.events
    if (events !== undefined) {
      const args = events[0].args
      if (args !== undefined) {
        expect(args.oracle).to.equal(functionMock.address)
      }
    }
  })

  async function setBaseInfo(lcMock: LightClientMock) {
    const { functionMock } = await loadFixture(deployFunctionMockFixture)
    await lcMock.setSubscriptionId(1)
    await lcMock.setProviderURL(80001, "https://polygon-mumbai.infura.io/v3")
    await lcMock.setSource(SOURCE)
    await lcMock.setOracle(functionMock.address)

    return { subscriptionId: 1, chainId: 80001, url: "https://polygon-mumbai.infura.io/v3", source: SOURCE }
  }

  it("requestQuery()", async function () {
    const { lcMock } = await loadFixture(deployLightClientMockFixture)
    const baseInfo = await setBaseInfo(lcMock)
    const requests: QueryType.QueryRequestStruct[] = SAMPLEQUERIES
    const tx = await lcMock.requestQuery(requests)
    const resTx: ContractReceipt = await tx.wait()
  })

  async function updateHeader(lcMock: LightClientMock) {
    const height = 8629032
    const accountProof = await getAccountProof(`https://eth-goerli.g.alchemy.com/v2/${process.env.ETHEREUM_GOERLI_API_KEY}`, SRC, height)
    const responses: QueryType.OracleResponseStruct[] = [{ dstChainId: 5, height, root: accountProof.root }]
    const tx = await lcMock.updateHeader(responses)
    return { dstChainId: 5, height, accountProof, responses }
  }
})
