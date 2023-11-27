// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

/**
 * @title Oracle interface
 * @notice This interface is used to interact with the oracle
 */
interface IOracle {
    enum Location {
        Inline,
        Remote
    }

    /**
     * @notice Send a simple request
     *
     * @param source JavaScript source code
     * @param secrets Encrypted secrets payload
     * @param secretsLocation Location of encrypted secrets (0 for inline, 1 for remote)
     * @param args List of arguments accessible from within the source code
     * @param subscriptionId Funtions billing subscription ID
     * @param gasLimit Maximum amount of gas used to call the client contract's `handleOracleFulfillment` function
     * @return Functions request ID
     */

    function executeRequest(
        string calldata source,
        bytes calldata secrets,
        Location secretsLocation,
        string[] calldata args,
        uint64 subscriptionId,
        uint32 gasLimit
    ) external returns (bytes32);
}
