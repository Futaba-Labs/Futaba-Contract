// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "../QueryType.sol";

interface ILightClient {
    event UpdateHeader(address indexed oracle, bytes32 rootHash, bytes result);

    function requestQuery(QueryType.QueryRequest[] memory queries) external;

    function verify(
        bytes memory message
    ) external returns (bool, bytes[] memory);
}
