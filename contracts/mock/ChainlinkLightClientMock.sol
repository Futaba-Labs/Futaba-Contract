// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import {TrieProofs} from "../lib/TrieProofs.sol";
import {QueryType} from "../QueryType.sol";
import {ChainlinkLightClient} from "../ChainlinkLightClient.sol";
import {IExternalAdapter} from "../interfaces/IExternalAdapter.sol";
import {EthereumDecoder} from "../lib/EthereumDecoder.sol";

/**
 * @title Chainlink LightClient
 * @notice Light Client Contract when using Chainlink Node Operator
 */

contract ChainlinkLightClientMock is ChainlinkLightClient {
    using TrieProofs for bytes;

    constructor(
        address _gateway,
        address _oracle
    ) ChainlinkLightClient(_gateway, _oracle) {}

    /**
     * @notice This function is intended to make Light Client do something when a query request is made (mock emit events to Oracle)
     * @param queries request query data
     */
    function requestQuery(
        QueryType.QueryRequest[] memory queries
    ) external override {
        uint256 querySize = queries.length;
        if (querySize > MAX_QUERY_COUNT) revert TooManyQueries();

        QueryType.OracleQuery[] memory requests = new QueryType.OracleQuery[](
            querySize
        );

        // Format query data for requests to chainlink
        for (uint i; i < querySize; i++) {
            QueryType.QueryRequest memory q = queries[i];
            requests[i] = QueryType.OracleQuery(q.dstChainId, q.height);
        }

        bytes32 requestId = IExternalAdapter(oracle).notifyOracle(requests);

        emit NotifyOracle(requestId, oracle, abi.encode(requests));
    }

    /**
     * @notice This function is for validation upon receipt of query(mock verifies account proof and storage proof)
     * @param message response query data
     */
    function verify(
        bytes memory message
    ) external override returns (bool, bytes[] memory) {
        Proof[] memory proofs = abi.decode(message, (Proof[]));
        uint256 proofSize = proofs.length;
        bytes[] memory results = new bytes[](proofSize);

        // Check if there is a corresponding state root for each query
        checkRoot(proofs);

        for (uint i; i < proofSize; i++) {
            Proof memory proof = proofs[i];
            // decode proof data
            (
                AccountProof memory accountProof,
                StorageProof[] memory storageProofs
            ) = abi.decode(proofs[i].proof, (AccountProof, StorageProof[]));

            bytes32 storageRoot = approvedStorageRoots[proof.dstChainId][
                proof.height
            ][accountProof.account];

            uint256 storageProofSize = storageProofs.length;

            // Check if there is a corresponding storage root for each query
            // If not saved, verify account proof
            // If stored, skip account proof verification and verify storage proof
            if (storageRoot != bytes32("")) {
                bytes memory result;
                // Storage proof verification
                for (uint j; j < storageProofSize; j++) {
                    StorageProof memory storageProof = storageProofs[j];
                    if (storageRoot != storageProof.root)
                        revert DifferentTrieRoots(storageProof.root);

                    bytes32 value = getStorageValue(storageProof);
                    result = bytes.concat(result, value);
                }
                results[i] = result;
            } else {
                // Account proof verification
                EthereumDecoder.Account memory account = EthereumDecoder
                    .toAccount(
                        accountProof.proof.verify(
                            approvedStateRoots[proof.dstChainId][proof.height],
                            keccak256(abi.encodePacked(accountProof.account))
                        )
                    );

                // If the account proof is successfully verified, the storage root that can be obtained from it is stored in the mapping.
                approvedStorageRoots[proof.dstChainId][proof.height][
                    accountProof.account
                ] = account.storageRoot;

                // Storage proof verification
                bytes memory result;
                for (uint j; j < storageProofSize; j++) {
                    StorageProof memory storageProof = storageProofs[j];
                    bytes32 value = getStorageValue(storageProof);
                    result = bytes.concat(result, value);
                }
                results[i] = result;
            }
        }
        return (true, results);
    }
}
