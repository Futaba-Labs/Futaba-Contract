import { ethers, network } from "hardhat";
import { QueryType } from "../typechain-types/contracts/Gateway";
import { MESSAGE } from "../test/utils/constants";
import { BigNumber } from "ethers";
import { concat, hexZeroPad, keccak256 } from "ethers/lib/utils";
import { GelatoRelay } from "@gelatonetwork/relay-sdk";
import DEPLOYMENTS from "../constants/deployments.json"

const relay = new GelatoRelay();

async function main() {
  const gatewayAddress = DEPLOYMENTS[network.name as keyof typeof DEPLOYMENTS].gateway
  const gateway = await ethers.getContractAt("Gateway", gatewayAddress)

  // storage slot of the token balance on the destination chain
  const slot1 = keccak256(concat([
    hexZeroPad("0x1aaaeb006AC4DE12C4630BB44ED00A764f37bef8", 32),
    hexZeroPad(BigNumber.from(0).toHexString(), 32),
  ]));

  const slot2 = keccak256(concat([
    hexZeroPad("0x1aaaeb006AC4DE12C4630BB44ED00A764f37bef8", 32),
    hexZeroPad(BigNumber.from(0).toHexString(), 32),
  ]));

  const usdcOnGoerli = "0xA2025B15a1757311bfD68cb14eaeFCc237AF5b43" // USDC on Goerli
  const linkOnOpGoerli = "0x14cd1A7b8c547bD4A2f531ba1BF11B6c4f2b96db" // LINK on Optimism Goerli
  const callBack = "0xda94E03f3c4C757bA2f1F7a58A00d2525569C75b" // Mock Receiver
  const lightClient = DEPLOYMENTS[network.name as keyof typeof DEPLOYMENTS]["light_client"]
  const message = MESSAGE

  const queries: QueryType.QueryRequestStruct[] = [
    {
      dstChainId: 5, to: usdcOnGoerli, height:
        8947355, slot: slot1
    },
    {
      dstChainId: 420, to: linkOnOpGoerli, height:
        9844409, slot: slot2
    },
  ]

  try {
    const dstChainId = 80001 // mumbai
    const nativeToken = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
    const gasLimit = BigNumber.from("1000000")
    const fee = await relay.getEstimatedFee(dstChainId, nativeToken, gasLimit, true)
    console.log("fee: ", fee.toString())
    const tx = await gateway.query(queries, lightClient, callBack, message, { gasLimit: 1000000, value: fee.mul(120).div(100) })
    await tx.wait()
    console.log(`The transaction is successful: ${JSON.stringify(tx)}`)
  } catch (error) {
    console.error(`The transaction is failed: ${JSON.stringify(error)}`)
  }

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
