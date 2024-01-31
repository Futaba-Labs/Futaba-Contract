import { ethers, network } from "hardhat";
import { QueryType } from "../typechain-types/contracts/Gateway";
import { MESSAGE } from "../test/utils/constants";
import { BigNumber } from "ethers";
import { concat, hexZeroPad, keccak256 } from "ethers/lib/utils";
import DEPLOYMENTS from "../constants/deployments.json"

async function main() {
  const gatewayAddress = DEPLOYMENTS[network.name as keyof typeof DEPLOYMENTS].gateway
  const gateway = await ethers.getContractAt("Gateway", gatewayAddress)

  // storage slot of the token balance on the destination chain
  const slot1 = keccak256(concat([
    hexZeroPad("0x2274d2C66dC7936044f7B46b7401c3F5187B78aa", 32),
    hexZeroPad(BigNumber.from(0).toHexString(), 32),
  ]));

  const slot2 = keccak256(concat([
    hexZeroPad("0x2274d2C66dC7936044f7B46b7401c3F5187B78aa", 32),
    hexZeroPad(BigNumber.from(0).toHexString(), 32),
  ]));

  const usdcOnGoerli = "0xA2025B15a1757311bfD68cb14eaeFCc237AF5b43" // USDC on Goerli
  const linkOnOpGoerli = "0x14cd1A7b8c547bD4A2f531ba1BF11B6c4f2b96db" // LINK on Optimism Goerli
  const callBack = "0x9D9AB95134aF0D7f468545E816f8b7E18407Eb26" // Mock Receiver
  const receiverMock = await ethers.getContractAt("ReceiverMock", callBack)
  const lightClient = DEPLOYMENTS[network.name as keyof typeof DEPLOYMENTS]["light_client"]
  const message = MESSAGE

  const queries: QueryType.QueryRequestStruct[] = [
    {
      dstChainId: 5, to: usdcOnGoerli, height:
        8947370, slot: slot1
    },
    {
      dstChainId: 420, to: linkOnOpGoerli, height:
        9844428, slot: slot2
    },
  ]
  console.log("queries: ", JSON.stringify(queries))

  try {
    // const sdk = new Fee({ chainId: 80001, stage: ChainStage.TESTNET })
    const fee = await gateway.estimateFee(lightClient, queries)
    console.log("fee: ", fee.toString())

    // send transaction
    // const tx = await gateway.query(queries, lightClient, callBack, message, { gasLimit: 1000000, value: fee.mul(120).div(100) })
    const tx = await receiverMock.sendQuery(queries, lightClient, message, { gasLimit: 1000000, value: fee.mul(120).div(100) })
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
