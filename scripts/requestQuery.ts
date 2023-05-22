import { ethers, network } from "hardhat";
import { QueryType } from "../typechain-types/contracts/Gateway";
import { MESSAGE } from "../test/utils/constants";
import { BigNumber } from "ethers";
import { concat, hexZeroPad, keccak256 } from "ethers/lib/utils";
import { GelatoRelay } from "@gelatonetwork/relay-sdk";
import DEPLOYMENTS from "../constants/deployments.json"

const relay = new GelatoRelay();

async function main() {
  const gateway = await ethers.getContractAt("Gateway", "0xFBA1ead0f2A08cEa9dBa82c10EE797836ecf6Ee7")

  const slot = concat([
    // Mappings' keys in Solidity must all be word-aligned (32 bytes)
    hexZeroPad("0x1aaaeb006AC4DE12C4630BB44ED00A764f37bef8", 32),

    // Similarly with the slot-index into the Solidity variable layout
    hexZeroPad(BigNumber.from(0).toHexString(), 32),
  ]);

  const slot2 = concat([
    // Mappings' keys in Solidity must all be word-aligned (32 bytes)
    hexZeroPad("0x2274d2C66dC7936044f7B46b7401c3F5187B78aa", 32),

    // Similarly with the slot-index into the Solidity variable layout
    hexZeroPad(BigNumber.from(0).toHexString(), 32),
  ]);

  const src = "0xA2025B15a1757311bfD68cb14eaeFCc237AF5b43"
  const callBack = "0xda94E03f3c4C757bA2f1F7a58A00d2525569C75b"
  const lightClient = DEPLOYMENTS[network.name as keyof typeof DEPLOYMENTS]["light_client"]
  const message = MESSAGE

  console.log(`slot: ${keccak256(slot)}`)

  const QueryRequests: QueryType.QueryRequestStruct[] = [
    {
      dstChainId: 5, to: src, height:
        8947355, slot: keccak256(slot)
    },
    {
      dstChainId: 5, to: src, height:
        8975344, slot: keccak256(slot2)
    },
  ]

  let tx
  try {
    const fee = await relay.getEstimatedFee(80001, "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", BigNumber.from("1000000"), true)
    console.log("fee: ", fee.toString())
    tx = await gateway.query(QueryRequests, lightClient, callBack, message, { gasLimit: 1000000, value: fee.mul(120).div(100) })
    await tx.wait()
    console.log(tx)
  } catch (error) {
    console.error(error)
  }

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
