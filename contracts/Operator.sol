// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.6;
import {Operator} from "@chainlink/contracts/src/v0.7/Operator.sol";

/**
 * @title Operator
 * @dev Simply import with the contract used to make the request to Chainlink.
 * However, solidity version 0.7.6 is required for this to work.
 * @notice Mock contract for Operator, the contract to which the results of the job will be sent back
 */
