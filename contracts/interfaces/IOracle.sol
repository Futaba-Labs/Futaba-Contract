// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "../QueryType.sol";

interface IOracle {
    function notifyOracle(
        QueryType.OracleQuery[] memory queries
    ) external returns (bytes32 requestId);
}
