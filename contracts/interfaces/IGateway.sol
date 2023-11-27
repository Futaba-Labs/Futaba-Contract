// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import "../QueryType.sol";

/**
 * @title Gateway interface
 * @notice This interfece is an endpoint for executing query
 * @notice NOT AUDITED
 */
interface IGateway {
    /**
     * @notice This contract is an endpoint for executing query
     * @param queries query data
     * @param lightClient The light client contract address
     * @param callBack The callback contract address
     * @param message Data used when executing callback
     */

    function query(
        QueryType.QueryRequest[] memory queries,
        address lightClient,
        address callBack,
        bytes calldata message
    ) external payable;

    /**
     * @notice This function is an endpoint for receiving query
     * @param response query response data
     */
    function receiveQuery(
        QueryType.QueryResponse memory response
    ) external payable;

    /**
     * @notice This function is used to estimate the cost of gas
     * @param lightClient The light client contract address
     * @param queries query data
     */
    function estimateFee(
        address lightClient,
        QueryType.QueryRequest[] memory queries
    ) external view returns (uint256);

    /**
     * @notice This function is used to reference cached data
     * @param queries query data
     */

    function getCache(
        QueryType.QueryRequest[] memory queries
    ) external view returns (bytes[] memory);
}
