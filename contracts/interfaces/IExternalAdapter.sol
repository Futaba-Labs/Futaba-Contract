// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import "../QueryType.sol";

/**
 * @title ExternalAdapter interface
 * @notice This interface is used to interact with the oracle using External Adapter
 */
interface IExternalAdapter {
    /**
     * @notice Send request to Chainlink Node
     * @param queries Query data formatted for Chainlink
     * @return requestId Request id issued by chainlink
     */
    function notifyOracle(
        QueryType.OracleQuery[] memory queries
    ) external returns (bytes32 requestId);
}
