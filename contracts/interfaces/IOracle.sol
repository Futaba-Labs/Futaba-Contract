// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

/**
 * @title Oracle interface
 * @dev This interface is used to interact with the oracle
 */
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
