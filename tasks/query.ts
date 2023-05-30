import { task, types } from "hardhat/config";
import DEPLOYMENTS from "../constants/deployments.json"
import { QueryType } from "../typechain-types/contracts/Gateway";
import { BigNumber, ContractReceipt } from "ethers";
import { GelatoRelay } from "@gelatonetwork/relay-sdk";
import { MESSAGE } from "../test/utils/constants";

const relay = new GelatoRelay();

task(
  "TASK_QUERY",
  "execute a query",
).addParam<string>("params",
  'Parameters for requesting query\nExample: [{dstChainId: 5, height: 8000000, to: "0xA2025B15a1757311bfD68cb14eaeFCc237AF5b43", slot: "0x0"}]',
  "", types.string)
  .setAction(async (taskArgs, hre): Promise<null> => {
    const params: QueryType.QueryRequestStruct[] = JSON.parse(taskArgs.params)

    for (const param of params) {
      param.slot = hre.ethers.utils.hexZeroPad(param.slot.toString(), 32)
    }

    console.log(`params: ${params}`)

    const gatewayAddress = DEPLOYMENTS[hre.network.name as keyof typeof DEPLOYMENTS].gateway
    if (!gatewayAddress) throw new Error("Gateway address is not found")
    const gateway = await hre.ethers.getContractAt("Gateway", gatewayAddress)

    const callBack = "0xda94E03f3c4C757bA2f1F7a58A00d2525569C75b" // Mock Receiver
    const lightClient = DEPLOYMENTS[hre.network.name as keyof typeof DEPLOYMENTS]["light_client"]
    const message = MESSAGE

    const chainId = hre.network.config.chainId
    if (!chainId) throw new Error("Src Chain is invalid. Please check your network config")
    const nativeToken = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
    const gasLimit = BigNumber.from("1000000")

    const fee = await relay.getEstimatedFee(chainId, nativeToken, gasLimit, true)
    console.log("fee: ", fee.toString())
    try {
      const tx = await gateway.query(params, lightClient, callBack, message, { gasLimit: 1000000, value: fee.mul(110).div(100) })
      console.log("Executing query...")
      const resTx: ContractReceipt = await tx.wait()
      console.log(`The transaction is successful`)
      console.log(tx)
      const events = resTx.events
      let queryId = ""
      if (events !== undefined) {
        queryId = events[0].args?.queryId
      } else {
        throw new Error("QueryId is not found")
      }
      console.log("Waitng for relaying and getting data...")
      gateway.removeAllListeners()
      const filter = gateway.filters.ReceiveQuery(queryId, null, null, null, null)

      await new Promise<void>(async (resolve, reject) => {
        try {
          gateway.on(filter, async (...args) => {
            const results = args[4]
            console.log(`The query result is ${results}`)
            resolve();
          })
        } catch (error) {
          console.error(`Listener Failed: ${JSON.stringify(error)}`)
          reject(error)
        }
      })

    } catch (error) {
      console.error(`The transaction is failed: ${JSON.stringify(error)}`)
    }
    return null;
  });
