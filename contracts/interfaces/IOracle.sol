// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

interface IOracle {
    enum Location {
        Inline,
        Remote
    }

    function executeRequest(
        string calldata source,
        bytes calldata secrets,
        Location secretsLocation,
        string[] calldata args,
        uint64 subscriptionId,
        uint32 gasLimit
    ) external returns (bytes32);
}
