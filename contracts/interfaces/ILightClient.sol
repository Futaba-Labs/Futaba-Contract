// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.19;

import {QueryType} from "../QueryType.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/**
 * @title Light client interface
 * @dev This interface is for verification of proof
 */

interface ILightClient is IERC165 {
    function requestQuery(QueryType.QueryRequest[] memory queries) external;

    function verify(
        bytes memory message
    ) external returns (bool, bytes[] memory);

    function estimateFee(
        QueryType.QueryRequest[] memory queries
    ) external view returns (uint256);

    function estimateQueryFee(
        QueryType.QueryRequest[] memory queries
    ) external view returns (uint256);
}
