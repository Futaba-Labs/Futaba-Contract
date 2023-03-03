// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "../lib/MPT.sol";
import "../lib/EthereumDecoder.sol";
import "../lib/TrieProofs.sol";

// Uncomment this line to use console.log
import "hardhat/console.sol";

contract StorageProofMock {
    struct AccountProof {
        bytes32 root;
        address account;
        bytes proof;
    }
    struct StorageProof {
        bytes32 root;
        bytes32 path;
        bytes proof;
    }

    using TrieProofs for bytes;

    function verifyStorage(
        AccountProof memory accountProof,
        StorageProof[] memory storageProofs
    ) public view returns (bytes[] memory) {
        bytes[] memory results = new bytes[](storageProofs.length);
        EthereumDecoder.Account memory account = EthereumDecoder.toAccount(
            accountProof.proof.verify(
                accountProof.root,
                keccak256(abi.encodePacked(accountProof.account))
            )
        );

        console.logBytes32(account.storageRoot);

        require(
            account.storageRoot == storageProofs[0].root,
            "verifyStorage - different trie roots"
        );

        for (uint i = 0; i < storageProofs.length; i++) {
            StorageProof memory storageProof = storageProofs[i];
            bytes32 path = keccak256(abi.encodePacked(storageProof.path));
            console.logBytes(storageProof.proof);
            bytes memory proof = storageProof.proof;
            results[i] = proof.verify(storageProof.root, path);
        }
        return results;
    }
}
