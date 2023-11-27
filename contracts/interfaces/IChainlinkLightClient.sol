// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import "../QueryType.sol";

/**
 * @title Light client mock interface
 * @notice Interfaces used in Light Client mock
 */
interface IChainlinkLightClient {
    event UpdateHeader(address indexed oracle, bytes32 rootHash, bytes result);

    /**
     * @notice This function is used to store block header information sent from Oracle to Light Client
     * @param responses Block header information received from Oracle
     */
    function updateHeader(QueryType.OracleResponse[] memory responses) external;
}
