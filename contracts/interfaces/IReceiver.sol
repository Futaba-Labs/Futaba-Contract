// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "../QueryType.sol";

interface IReceiver {
    function receiveQuery(
        bytes[] memory results,
        QueryType.QueryRequest[] memory queries,
        bytes memory message
    ) external;
}
