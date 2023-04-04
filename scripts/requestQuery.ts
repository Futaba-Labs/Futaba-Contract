import { ethers, network } from "hardhat";
import { QueryType } from "../typechain-types/contracts/Gateway";
import { SRC, TEST_CALLBACK_ADDRESS, TEST_LIGHT_CLIENT_ADDRESS, MESSAGE } from "../test/utils/constants";
import { getSlots } from "../test/utils/helper";
import { BigNumber } from "ethers";
import { concat, hexZeroPad, keccak256 } from "ethers/lib/utils";
import { CallWithSyncFeeRequest, GelatoRelay } from "@gelatonetwork/relay-sdk";

const relay = new GelatoRelay();

async function main() {
  const gateway = await ethers.getContractAt("Gateway", "0x21b75559E0bCAD1D95ef451a0259060F7e9594C4")

  const slot = concat([
    // Mappings' keys in Solidity must all be word-aligned (32 bytes)
    hexZeroPad("0x1aaaeb006AC4DE12C4630BB44ED00A764f37bef8", 32),

    // Similarly with the slot-index into the Solidity variable layout
    hexZeroPad(BigNumber.from(0).toHexString(), 32),
  ]);

  const src = "0x779877A7B0D9E8603169DdbD7836e478b4624789"
  const callBack = "0xda94E03f3c4C757bA2f1F7a58A00d2525569C75b"
  const lightClient = "0x54fF6f270a172022E03706f6A2eD86a8Db31fCA5"
  const message = MESSAGE

  const QueryRequests: QueryType.QueryRequestStruct[] = [
    {
      dstChainId: 11155111, to: src, height:
        3218047, slot: keccak256(slot)
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
