// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "../interfaces/IReceiver.sol";
import "../QueryType.sol";

/**
 * @title ReceiverBadMock contract
 * @notice Contracts for generating errors in receiver when testing
 */
contract ReceiverBadMock is IReceiver {
    function receiveQuery(
        bytes32 queryId,
        bytes[] memory results,
        QueryType.QueryRequest[] memory queries,
        bytes memory message
    ) external {
        revert("Futaba: ReceiverBadMock");
    }

    function supportsInterface(
        bytes4 interfaceId
    ) external pure returns (bool) {
        return interfaceId == type(IReceiver).interfaceId;
    }
}
