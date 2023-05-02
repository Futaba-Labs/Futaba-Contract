// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

interface ERC677Receiver {
    function onTokenTransfer(
        address _sender,
        uint _value,
        bytes memory _data
    ) external;
}
