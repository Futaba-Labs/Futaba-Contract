// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

/**
 * @title QueryType
 * @notice This library defines the data structures used in the query
 */
contract QueryType {
    struct QueryRequest {
        uint256 dstChainId;
        address to;
        // block height
        uint256 height;
        // storage slot
        bytes32 slot;
    }

    struct OracleQuery {
        uint256 dstChainId;
        uint256 height;
    }

    struct OracleResponse {
        uint256 dstChainId;
        uint256 height;
        // state root
        bytes32 root;
    }

    struct QueryResponse {
        // Unique id to access query state
        bytes32 queryId;
        // Encoded data for verification
        bytes proof;
    }
}
