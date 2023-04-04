// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "../QueryType.sol";

/**
 * @title Light client interface
 * @notice This interface is for verification of proof
 * @notice NOT AUDITED
 */

interface ILightClient {
    /**
     * @notice This function is intended to make Light Client do something when a query request is made (mock emit events to Oracle)
     * @param queries request query data
     */
    function requestQuery(QueryType.QueryRequest[] memory queries) external;

    /**
     * @notice This function is for validation upon receipt of query(mock verifies account proof and storage proof)
     * @param message response query data
     */
    function verify(
        bytes memory message
    ) external returns (bool, bytes[] memory);

    function estimateFee(
        QueryType.QueryRequest[] memory queries
    ) external view returns (uint256);
}
