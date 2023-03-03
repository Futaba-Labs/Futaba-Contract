// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "./IGateway.sol";

interface IReceiver {
    function receiveQuery(
        bytes[] memory results,
        IGateway.Query[] memory queries,
        bytes memory message
    ) external;
}
