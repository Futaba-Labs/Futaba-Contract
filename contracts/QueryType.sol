// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

contract QueryType {
    struct QueryRequest {
        uint32 dstChainId;
        address to;
        uint256 height;
        bytes32 slot;
    }

    struct QueryResponse {
        bytes32 queryId;
        address lightClient;
        address callBack;
        bytes packet;
        bytes proof;
    }
}
