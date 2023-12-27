// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.19;

import {QueryType} from "../QueryType.sol";

/**
 * @title Gateway interface
 * @dev This interfece is an endpoint for executing query
 */
interface IGateway {
    function query(
        QueryType.QueryRequest[] memory queries,
        address lightClient,
        address callBack,
        bytes calldata message
    ) external payable;

    function receiveQuery(
        QueryType.QueryResponse memory response
    ) external payable;

    function estimateFee(
        address lightClient,
        QueryType.QueryRequest[] memory queries
    ) external view returns (uint256);

    function getCache(
        QueryType.QueryRequest[] memory queries
    ) external view returns (bytes[] memory);
}
