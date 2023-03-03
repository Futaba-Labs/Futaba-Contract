import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import { RLP, concat, defaultAbiCoder, hexZeroPad, keccak256 } from "ethers/lib/utils";
import { BigNumber } from "ethers";
import { Alchemy, Network } from "alchemy-sdk";
import * as dotenv from 'dotenv';
//@ts-ignore
import { GetProof } from 'eth-proof'
dotenv.config();


describe("StorageProofMock", async function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployStorageProofMockFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await ethers.getSigners();

    const StorageProofMock = await ethers.getContractFactory("StorageProofMock");
    const mock = await StorageProofMock.deploy();

    return { mock, owner, otherAccount };
  }

  describe("verifyStorageProof", async function () {
    it("verify account and storage proof", async function () {
      const { mock } = await loadFixture(deployStorageProofMockFixture)
      const blockNumber = BigNumber.from(32130734).toHexString()
      let options = {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'eth_getBlockByNumber', params: [blockNumber, true] })
      };

      const res = await fetch(`https://polygon-mumbai.g.alchemy.com/v2/${process.env.POLYGON_TESTNET_API_KEY}`, options)
      const result = await res.json()
      console.log(result)

      const src = "0x78F2a2d8311447b9f1De8899f6F07564Bd19707e"
      const newKeyPreimage1 = concat([
        // Mappings' keys in Solidity must all be word-aligned (32 bytes)
        hexZeroPad("0xe77486A6CEBed21C458f95Cd883Efce3C0Af8d63", 32),

        // Similarly with the slot-index into the Solidity variable layout
        hexZeroPad(BigNumber.from(3).toHexString(), 32),
      ]);
      const newKeyPreimage2 = concat([
        // Mappings' keys in Solidity must all be word-aligned (32 bytes)
        hexZeroPad("0x5", 32),

        // Similarly with the slot-index into the Solidity variable layout
        hexZeroPad(BigNumber.from(2).toHexString(), 32),
      ]);
      const newKeyPreimage3 = defaultAbiCoder.encode(["string"], ["nonce"])
      options = {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'eth_getProof', params: [src, [keccak256(newKeyPreimage1), keccak256(newKeyPreimage2), keccak256(newKeyPreimage3)], "0x41d9a663d904219f0d187490122a62aafe39748b6b24548e19513d7dcd4470f8"] })
      };

      const response = await fetch(`https://polygon-mumbai.g.alchemy.com/v2/${process.env.POLYGON_TESTNET_API_KEY}`, options)
      const re = await response.json()
      console.log(re.result.storageProof)
      // console.log(keccak256(newKeyPreimage1))

      const getProof = new GetProof(`https://polygon-mumbai.g.alchemy.com/v2/${process.env.POLYGON_TESTNET_API_KEY}`)
      const storageProofs1 = await getProof.storageProof(src, keccak256(newKeyPreimage1), "0x41d9a663d904219f0d187490122a62aafe39748b6b24548e19513d7dcd4470f8")
      const storageProofs2 = await getProof.storageProof(src, keccak256(newKeyPreimage2), "0x41d9a663d904219f0d187490122a62aafe39748b6b24548e19513d7dcd4470f8")
      const accountProofs = await getProof.accountProof(src, "0x41d9a663d904219f0d187490122a62aafe39748b6b24548e19513d7dcd4470f8")

      console.log(storageProofs1.header.toJson())
      console.log(storageProofs2.header.toJson())

      const accountProof = {
        root: result.result.stateRoot,
        account: src,
        proof: RLP.encode(accountProofs.accountProof)
      }
      const storageProof1 = {
        root: re.result.storageHash,
        path: keccak256(newKeyPreimage1),
        proof: RLP.encode(storageProofs1.storageProof)
      }
      const storageProof2 = {
        root: re.result.storageHash,
        path: keccak256(newKeyPreimage2),
        proof: RLP.encode(storageProofs2.storageProof)
      }
      const data = await mock.verifyStorage(accountProof, [storageProof1, storageProof2])
      console.log(data)
    });
  });
});
