import { ethers, network } from "hardhat";
import { QueryType } from "../typechain-types/contracts/Gateway";
import { SRC, TEST_CALLBACK_ADDRESS, TEST_LIGHT_CLIENT_ADDRESS, MESSAGE } from "../test/utils/constants";
import { getSlots } from "../test/utils/helper";
import { BigNumber } from "ethers";
import { concat, hexZeroPad, keccak256 } from "ethers/lib/utils";

async function main() {
  const gateway = await ethers.getContractAt("Gateway", "0x09505D7A6c1D6f682084fD4a1B9473F0093702B9")

  const slot = concat([
    // Mappings' keys in Solidity must all be word-aligned (32 bytes)
    hexZeroPad("0x1aaaeb006AC4DE12C4630BB44ED00A764f37bef8", 32),

    // Similarly with the slot-index into the Solidity variable layout
    hexZeroPad(BigNumber.from(0).toHexString(), 32),
  ]);

  const src = "0xA2025B15a1757311bfD68cb14eaeFCc237AF5b43"
  const callBack = "0x119c88D95f85c48ea6799321F1E64eEBc81A99F8"
  const lightClient = "0x48bD7185A33deDA5f9644e56f0A094369B6EBe96"
  const message = MESSAGE

  const QueryRequests: QueryType.QueryRequestStruct[] = [
    { dstChainId: 5, to: src, height: 8629032, slot: keccak256(slot) },
    { dstChainId: 5, to: src, height: 8629032, slot: keccak256(slot) },
    { dstChainId: 5, to: src, height: 8629032, slot: keccak256(slot) },
  ]

  let tx
  try {
    tx = await gateway.query(QueryRequests, lightClient, callBack, message, { gasLimit: 1000000 })
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
