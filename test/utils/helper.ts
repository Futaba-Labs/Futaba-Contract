import { BigNumber } from "ethers";
import { RLP, concat, hexZeroPad, keccak256 } from "ethers/lib/utils";
//@ts-ignore
import { GetProof } from 'eth-proof'
//@ts-ignore
import { Proof } from 'eth-object'
import { FunctionsMock, LightClientMock, OracleTestMock } from "../../typechain-types";
import { SAMPLE_RESPONSE, SAMPLE_RESPONSE_FOR_NODE, SOURCE, ZERO_ADDRESS } from "./constants";

// Calculate slots for testing
export const getSlots = () => {
  const newKeyPreimage1 = concat([
    // Mappings' keys in Solidity must all be word-aligned (32 bytes)
    hexZeroPad("0x1aaaeb006AC4DE12C4630BB44ED00A764f37bef8", 32),

    // Similarly with the slot-index into the Solidity variable layout
    hexZeroPad(BigNumber.from(0).toHexString(), 32),
  ]);
  const newKeyPreimage2 = concat([
    // Mappings' keys in Solidity must all be word-aligned (32 bytes)
    hexZeroPad("0x5", 32),

    // Similarly with the slot-index into the Solidity variable layout
    hexZeroPad(BigNumber.from(2).toHexString(), 32),
  ]);
  return [keccak256(newKeyPreimage1), keccak256(newKeyPreimage2)]
}

export const getAccountProof = async (rpcURL: string, src: string, blockNumber: number) => {
  const hexBlockNumber = BigNumber.from(blockNumber).toHexString()
  const options = {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'eth_getBlockByNumber', params: [hexBlockNumber, true] })
  };

  const res = await fetch(rpcURL, options)
  const result = await res.json()
  const header = result.result

  const getProof = new GetProof(rpcURL)

  const accountProofs = await getProof.accountProof(src, header.hash)

  return {
    root: result.result.stateRoot,
    account: src,
    proof: RLP.encode(accountProofs.accountProof)
  }
}

export const getStorageProof = async (rpcURL: string, src: string, blockNumber: number, slot: string) => {
  const hexBlockNumber = BigNumber.from(blockNumber).toHexString()
  let options = {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'eth_getBlockByNumber', params: [hexBlockNumber, true] })
  };

  let res = await fetch(rpcURL, options)
  let result = await res.json()
  const header = result.result

  options = {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'eth_getProof', params: [src, [slot], header.hash] })
  };

  res = await fetch(rpcURL, options)
  result = await res.json()

  // console.log(result.result)

  const getProof = new GetProof(rpcURL)

  // const storageProofs = await getProof.storageProof(src, slot, header.hash)

  return {
    root: result.result.storageHash,
    path: slot,
    proof: RLP.encode(Proof.fromRpc(result.result.storageProof[0].proof))
  }
}

export const setOrcale = async (lcMock: LightClientMock, oracle: string) => {
  const tx = await lcMock.setOracle(oracle)
  const resTx = await tx.wait()
  console.log(resTx)
}

export const setLightClient = async (functionMock: FunctionsMock, lightClient: string) => {
  const tx = await functionMock.setLightClient(lightClient)
  const resTx = await tx.wait()
  console.log(resTx)
}

export const setSubscriptionId = async (lcMock: LightClientMock, subscriptionId: number) => {
  const tx = await lcMock.setSubscriptionId(subscriptionId)
  const resTx = await tx.wait()
  console.log(resTx)
}

export const setSource = async (lcMock: LightClientMock) => {
  const tx = await lcMock.setSource(SOURCE)
  const resTx = await tx.wait()
  console.log(resTx)
}

export const setup = async (lcMock: LightClientMock, functionMock: FunctionsMock) => {
  await setOrcale(lcMock, functionMock.address)
  await setLightClient(functionMock, lcMock.address)
  await setSource(lcMock)
  await setSubscriptionId(lcMock, 0)
}

export const updateHeaderForFunctions = async (functionMock: FunctionsMock) => {
  const tx = await functionMock.fillFulfillment(hexZeroPad("0x1aaaeb006AC4DE12C4630BB44ED00A764f37bef8", 32), SAMPLE_RESPONSE)
  await tx.wait()
}

// Update header using chainlink node operator
export async function updateHeaderForNode(oracleMock: OracleTestMock, requestId: string = hexZeroPad(ZERO_ADDRESS, 32)) {
  const tx = await oracleMock.fulfill(hexZeroPad(requestId, 32), SAMPLE_RESPONSE_FOR_NODE);
  const res = await tx.wait();
}
