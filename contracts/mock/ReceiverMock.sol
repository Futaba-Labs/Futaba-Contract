// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "../interfaces/IReceiver.sol";
import "../QueryType.sol";

/**
 * @title ReceiverMock contract
 * @notice This contract receives queries
 * @notice NOT AUDITED
 */
contract ReceiverMock is IReceiver {
    event QueryReceived(
        bytes[] results,
        QueryType.QueryRequest[] queries,
        bytes message
    );

    function receiveQuery(
        bytes[] memory results,
        QueryType.QueryRequest[] memory queries,
        bytes memory message
    ) external {
        emit QueryReceived(results, queries, message);
    }
}
