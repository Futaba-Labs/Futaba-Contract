// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.19;

/**
 * @title ERC677Receiver
 * @dev Used for inheritance in Link Token mock
 */

interface ERC677Receiver {
    function onTokenTransfer(
        address _sender,
        uint _value,
        bytes memory _data
    ) external;
}
