// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "../QueryType.sol";

interface IGateway {
    event Packet(
        address indexed sender,
        bytes32 indexed queryId,
        bytes packet,
        bytes message,
        address lightClient,
        address callBack
    );

    event QueryReceived(
        address callBack,
        QueryType.QueryResponse responses,
        bytes message
    );

    function query(
        QueryType.QueryRequest[] memory queiries,
        address ligthClient,
        address callBack,
        bytes calldata message
    ) external payable;

    function receiveQuery(
        QueryType.QueryResponse memory response
    ) external payable;
}
