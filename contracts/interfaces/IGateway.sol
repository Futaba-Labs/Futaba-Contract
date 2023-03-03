// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

interface IGateway {
    struct QueryRequest {
        uint32 dstChainId;
        address to;
        uint256 height;
        bytes32 slot;
    }

    struct QueryResponse {
        bytes32 queryId;
        address lightClient;
        bytes packet;
        bytes proof;
    }
    event Packet(
        address indexed sender,
        bytes32 indexed queryId,
        bytes packet,
        bytes message,
        address lightClient
    );

    event QueryReceived(
        address callBack,
        QueryResponse[] responses,
        bytes message
    );

    function query(
        QueryRequest[] memory queiries,
        address ligthClient,
        address callBack,
        bytes calldata message
    ) external payable;

    function receiveQuery(QueryResponse memory response) external payable;
}
