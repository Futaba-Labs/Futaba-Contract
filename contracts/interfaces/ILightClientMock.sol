// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "../QueryType.sol";

interface ILightClientMock {
    function updateHeader(QueryType.OracleResponse[] memory responses) external;
}
