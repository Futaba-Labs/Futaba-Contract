// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "../interfaces/ILightClient.sol";
import "../lib/TrieProofs.sol";
import "../lib/EthereumDecoder.sol";
import "hardhat/console.sol";

contract LightClientMock is ILightClient {
    using TrieProofs for bytes;

    mapping(uint32 => mapping(uint256 => mapping(address => bytes32)))
        public approvedStorageRoots;

    struct Proof {
        uint32 dstChainId;
        uint256 height;
        bytes proof;
    }
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

    function verify(
        bytes memory message
    ) public returns (bool, bytes[] memory) {
        console.log("verify - message");
        Proof[] memory proofs = abi.decode(message, (Proof[]));
        bytes[] memory results = new bytes[](proofs.length);
        for (uint i = 0; i < proofs.length; i++) {
            Proof memory proof = proofs[i];
            (
                AccountProof memory accountProof,
                StorageProof[] memory storageProofs
            ) = abi.decode(proofs[i].proof, (AccountProof, StorageProof[]));
            if (
                approvedStorageRoots[proof.dstChainId][proof.height][
                    accountProof.account
                ] != bytes32("")
            ) {
                // TODO need to implenment logic if value is more than 32 bytes
                for (uint j = 0; j < storageProofs.length; j++) {
                    StorageProof memory storageProof = storageProofs[j];
                    require(
                        approvedStorageRoots[proof.dstChainId][proof.height][
                            accountProof.account
                        ] == storageProof.root,
                        "verify - different trie roots"
                    );
                    bytes32 path = keccak256(
                        abi.encodePacked(storageProof.path)
                    );
                    results[i] = storageProof.proof.verify(
                        storageProof.root,
                        path
                    );
                }
            } else {
                EthereumDecoder.Account memory account = EthereumDecoder
                    .toAccount(
                        accountProof.proof.verify(
                            accountProof.root,
                            keccak256(abi.encodePacked(accountProof.account))
                        )
                    );
                approvedStorageRoots[proof.dstChainId][proof.height][
                    accountProof.account
                ] = account.storageRoot;
                for (uint j = 0; j < storageProofs.length; j++) {
                    StorageProof memory storageProof = storageProofs[j];
                    bytes32 path = keccak256(
                        abi.encodePacked(storageProof.path)
                    );
                    results[i] = storageProof.proof.verify(
                        storageProof.root,
                        path
                    );
                }
            }
        }
        return (true, results);
    }
}
