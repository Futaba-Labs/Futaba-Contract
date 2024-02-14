import { ethers, network } from "hardhat";
import { QueryType } from "../typechain-types/contracts/Gateway";
import { MESSAGE } from "../test/utils/constants";
import { BigNumber } from "ethers";
import { concat, hexZeroPad, keccak256 } from "ethers/lib/utils";
import DEPLOYMENTS from "../constants/deployments.json"

async function main() {
  const gatewayAddress = DEPLOYMENTS[network.name as keyof typeof DEPLOYMENTS].gateway
  const gateway = await ethers.getContractAt("Gateway", gatewayAddress)
  const lc = await ethers.getContractAt("ChainlinkLightClient", DEPLOYMENTS[network.name as keyof typeof DEPLOYMENTS]["light_client"])

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
  const usdcOnSepolia = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8" // USDC on Sepolia
  // const callBack = "0x9D9AB95134aF0D7f468545E816f8b7E18407Eb26" // Mock Receiver on Mumbai
  const callBack = "0x8D84d35Dbb398b8bce7de49dD7f517253FF9D53a" // Mock Receiver on Arbitrum Sepolia
  const receiverMock = await ethers.getContractAt("ReceiverMock", callBack)
  const lightClient = DEPLOYMENTS[network.name as keyof typeof DEPLOYMENTS]["light_client"]
  const message = MESSAGE

  // const queries: QueryType.QueryRequestStruct[] = [
  //   {
  //     dstChainId: 5, to: usdcOnGoerli, height:
  //       8947370, slot: slot1
  //   },
  //   {
  //     dstChainId: 420, to: linkOnOpGoerli, height:
  //       9844428, slot: slot2
  //   },
  // ]
  const queries: QueryType.QueryRequestStruct[] = [
    {
      dstChainId: 11155111, to: usdcOnSepolia, height:
        5287151, slot: slot1
    }
  ]
  console.log("queries: ", JSON.stringify(queries))

  try {
    // const sdk = new Fee({ chainId: 80001, stage: ChainStage.TESTNET })
    const fee = await gateway.estimateFee(lightClient, queries)
    console.log("fee: ", fee.toString())

    const lcFee = await lc.estimateFee(queries)
    console.log("lcFee: ", lcFee.toString())

    const queryFee = await lc.estimateQueryFee(queries)
    console.log("queryFee: ", queryFee.toString())

    // send transaction
    const tx = await receiverMock.sendQuery(queries, lightClient, message, { gasLimit: 3000000, value: fee.mul(120).div(100) })
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
