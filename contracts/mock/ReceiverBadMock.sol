// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.19;

import {IReceiver} from "../interfaces/IReceiver.sol";
import {QueryType} from "../QueryType.sol";

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
