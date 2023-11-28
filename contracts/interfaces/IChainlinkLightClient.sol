// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import "../QueryType.sol";

/**
 * @title ChainlinkLightClient interface
 * @dev This is ChainlinkLightClient interface when using Chainlink Node Operator
 */
interface IChainlinkLightClient {
    event UpdateHeader(address indexed oracle, bytes32 rootHash, bytes result);

    function updateHeader(QueryType.OracleResponse[] memory responses) external;
}
