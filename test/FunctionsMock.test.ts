import { loadFixture } from "@nomicfoundation/hardhat-network-helpers"
import { expect } from "chai"
import { ethers } from "hardhat"
import fs from "fs"
import { ExecuteRequestEventObject } from "../typechain-types/contracts/mock/FunctionsMock"
import { MESSAGE, SAMPLE_RESPONSE, SOURCE } from "./utils/constants"
import { BigNumber, ContractReceipt } from "ethers"
import { deployFunctionMockFixture, deployLightClientMockFixture } from "./utils/fixture"
import { keccak256 } from "ethers/lib/utils"

//@dev This function is currently not in use
describe("Chainlink Functions", async function () {

  it('executeRequest()', async function () {
    const { functionMock } = await loadFixture(deployFunctionMockFixture)
    const request: ExecuteRequestEventObject = {
      source: SOURCE,
      secrets: MESSAGE,
      secretsLocation: 0,
      args: [`[["https://polygon-mumbai.infura.io/v3", "80001", "32130734"], ["https://polygon-mumbai.infura.io/v3", "80001", "33668401"]]`],
      subscriptionId: BigNumber.from(1),
      gasLimit: 100000
    }
    const tx = await functionMock.executeRequest(request.source, request.secrets, request.secretsLocation, request.args, request.subscriptionId, request.gasLimit)
    const resTx: ContractReceipt = await tx.wait()
    const events = resTx.events

    if (events !== undefined) {
      const args = events[0].args
      if (args !== undefined) {
        expect(args.source).to.equal(request.source)
        expect(args.secrets).to.equal(request.secrets.toLowerCase())
        expect(args.secretsLocation).to.equal(request.secretsLocation)
        expect(args.args[0]).to.equal(request.args[0])
        expect(args.subscriptionId).to.equal(request.subscriptionId)
        expect(args.gasLimit).to.equal(request.gasLimit)
      }
    }
  })

  it("fillFulfillment()", async function () {
    const { functionMock } = await loadFixture(deployFunctionMockFixture)
    const { lcMock } = await loadFixture(deployLightClientMockFixture)
    let tx = await functionMock.setLightClient(lcMock.address)
    await tx.wait()

    tx = await lcMock.setOracle(functionMock.address)
    await tx.wait()

    const response = "0x22322c31313135353131312c333231383034372c32383932393232313133383730313730323333333334393639333435393538383036373033343232333537363239393134373236303138353037313230393630343637383936313230363037302c31313135353131312c333231383034372c32383932393232313133383730313730323333333334393639333435393538383036373033343232333537363239393134373236303138353037313230393630343637383936313230363037302c22"
    tx = await functionMock.fillFulfillment(keccak256(BigNumber.from(0).toHexString()), response)
  })
})