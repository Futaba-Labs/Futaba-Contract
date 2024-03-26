// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.19;

import {QueryType} from "../QueryType.sol";

/**
 * @title ExternalAdapter interface
 * @dev This interface is used to interact with the oracle using External Adapter
 */
interface IExternalAdapter {
    function notifyOracle(
        QueryType.OracleQuery[] memory queries
    ) external returns (bytes32 requestId);

    function getFee() external view returns (uint256);
}
