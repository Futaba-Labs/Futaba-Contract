// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.19;

import {ChainlinkClient, Chainlink} from "@chainlink/contracts/src/v0.8/ChainlinkClient.sol";
import {ConfirmedOwner} from "@chainlink/contracts/src/v0.8/ConfirmedOwner.sol";
import {IExternalAdapter} from "./interfaces/IExternalAdapter.sol";
import {IChainlinkLightClient} from "./interfaces/IChainlinkLightClient.sol";
import {QueryType} from "./QueryType.sol";

interface IERC677 {
    function transferAndCall(
        address to,
        uint value,
        bytes memory data
    ) external returns (bool success);
}

/**
 * @title Chainlink Oracle contract
 * @notice This is ChainlinkOracle contract when using Chainlink Node Operator
 */
contract ChainlinkOracle is ChainlinkClient, ConfirmedOwner, IExternalAdapter {
    /* ----------------------------- Libraries -------------------------------- */

    using Chainlink for Chainlink.Request;

    /* ----------------------------- Public Storage -------------------------------- */

    uint256 private constant _MIN_NODE_OPERATOR_FEE = 0.001 ether;
    uint256 private constant _MAX_NODE_OPERATOR_FEE = 1 ether;

    // Jobid to be executed by Node Operator
    bytes32 private _jobId;
    // Amount of LINK token paid to Node Operator
    uint256 private _fee;
    // Chainlink Mock address
    address public lightClient;

    /* ----------------------------- Events -------------------------------- */

    /**
     * @notice This event is emitted when the client address is updated
     * @param client The new client address
     * @param oldLightClient The old client address
     * @param updatedAt The timestamp when the client address is updated
     */
    event SetClient(
        address indexed client,
        address indexed oldLightClient,
        uint256 updatedAt
    );

    /**
     * @notice This event is emitted when the oracle address is updated
     * @param oracle The new oracle address
     * @param oldOracle The old oracle address
     * @param updatedAt The timestamp when the oracle address is updated
     */
    event SetOracle(
        address indexed oracle,
        address indexed oldOracle,
        uint256 updatedAt
    );

    /**
     * @notice This event is emitted when the link token address is updated
     * @param tokenAddress The new link token address
     * @param oldTokenAddress The old link token address
     * @param updatedAt The timestamp when the link token address is updated
     */
    event SetLinkToken(
        address indexed tokenAddress,
        address indexed oldTokenAddress,
        uint256 updatedAt
    );

    /**
     * @notice This event is emitted when the job id is updated
     * @param jobId The new job id
     * @param oldJobId The old job id
     * @param updatedAt The timestamp when the job id is updated
     */
    event SetJobId(
        bytes32 indexed jobId,
        bytes32 indexed oldJobId,
        uint256 updatedAt
    );

    /**
     * @notice This event is emitted when the fee is updated
     * @param fee The new fee
     * @param oldFee The old fee
     * @param updatedAt The timestamp when the fee is updated
     */
    event SetFee(
        uint256 indexed fee,
        uint256 indexed oldFee,
        uint256 updatedAt
    );

    /* ----------------------------- Errors -------------------------------- */

    /**
     * @notice This error is emitted when the node operator fee is zero
     */
    error NodeOperatorFeeCannotBeZero();

    /**
     * @notice This error is emitted when the node operator fee is less than the minimum fee
     */
    error MinNodeOperatorFee();

    /**
     * @notice This error is emitted when the node operator fee is more than the maximum fee
     */
    error MaxNodeOperatorFee();

    /**
     * @notice This error is emitted when the input address is zero
     */
    error InvalidInputZeroAddress();

    /**
     * @notice This error is emitted when the input bytes32 is empty
     */
    error InvalidInputEmptyBytes32();

    /**
     * @notice This error is emitted when the caller is not authorized
     */
    error NotAuthorized();

    /**
     * @notice This error is emitted when the light client is invalid
     */
    error InvalidLightClient();

    /* ----------------------------- Constructor -------------------------------- */

    /**
     * @notice Constructor that sets chainlink information
     * @param _tokenAddress The address of the link token
     * @param _jobid The job id to be executed by Node Operator
     * @param _operator The address of the Node Operator
     * @param _fee The amount of LINK token paid to Node Operator
     * @param _lightClient The address of the Chainlink Mock
     */
    constructor(
        address _tokenAddress,
        bytes32 _jobid,
        address _operator,
        uint256 _fee,
        address _lightClient
    ) ConfirmedOwner(msg.sender) {
        setJobId(_jobid);
        setLinkToken(_tokenAddress);
        setOracle(_operator);
        setFee(_fee);
        setClient(_lightClient);
    }

    /* ----------------------------- External Functions -------------------------------- */

    /**
     * @notice Send request to Chainlink Node
     * @dev This function uses ChainlinkClient to make a request to the off-chain Chainlink node to get the state root.
     * @param queries Query data formatted for Chainlink
     * @return requestId Request id issued by chainlink
     */
    function notifyOracle(
        QueryType.OracleQuery[] memory queries
    ) external returns (bytes32 requestId) {
        if (msg.sender != lightClient) revert NotAuthorized();
        Chainlink.Request memory req = buildChainlinkRequest(
            _jobId,
            address(this),
            this.fulfill.selector
        );
        bytes memory encodedQueries = abi.encode(queries);
        Chainlink.addBytes(req, "queries", encodedQueries);

        requestId = sendChainlinkRequest(req, _fee);

        return requestId;
    }

    /**
     * @notice Callback function executed by the Node Operator to return data
     * @dev This function passes the data about state root received from Chainlink node to ChainlinkLightClient contract.
     * @param _requestId Id of the request
     * @param payload Data returned by the Node Operator
     */
    function fulfill(
        bytes32 _requestId,
        bytes memory payload
    ) external virtual recordChainlinkFulfillment(_requestId) {
        QueryType.OracleResponse[] memory responses = abi.decode(
            payload,
            (QueryType.OracleResponse[])
        );
        IChainlinkLightClient(lightClient).updateHeader(responses);
    }

    /**
     * @notice Get the address of the ChainlinkLightClient contract
     * @return The address of the ChainlinkLightClient contract
     */
    function getClient() external view returns (address) {
        return lightClient;
    }

    /**
     * @notice Get the address of the Chainlink Token contract
     * @return The address of the Chainlink Token contract
     */
    function getLinkToken() external view returns (address) {
        return chainlinkTokenAddress();
    }

    /**
     * @notice Get the address of the Chainlink Operator contract
     * @return The address of the Chainlink Operator contract
     */
    function getOracle() external view returns (address) {
        return chainlinkOracleAddress();
    }

    /**
     * @notice Get the job id to be executed by Node Operator
     * @return The job id to be executed by Node Operator
     */
    function getJobId() external view returns (bytes32) {
        return _jobId;
    }

    /**
     * @notice Get the amount of LINK token paid to Node Operator
     * @return The amount of LINK token paid to Node Operator
     */
    function getFee() external view returns (uint256) {
        return _fee;
    }

    /* ----------------------------- Public Functions -------------------------------- */

    /**
     * @notice Set the address of the ChainlinkLightClient contract
     * @param _client The address of the ChainlinkLightClient contract
     */
    function setClient(address _client) public onlyOwner {
        if (_client == address(0)) revert InvalidInputZeroAddress();
        address oldLightClient = lightClient;
        lightClient = _client;
        emit SetClient(_client, oldLightClient, block.timestamp);
    }

    /**
     * @notice Set the address of the Chainlink Token contract
     * @param _tokenAddress The address of the Chainlink Token contract
     */
    function setLinkToken(address _tokenAddress) public onlyOwner {
        require(
            IERC677(_tokenAddress).transferAndCall.selector != bytes4(0),
            "Token must be ERC-677 compatible"
        );

        if (_tokenAddress == address(0)) revert InvalidInputZeroAddress();
        address oldTokenAddress = chainlinkTokenAddress();
        setChainlinkToken(_tokenAddress);

        emit SetLinkToken(_tokenAddress, oldTokenAddress, block.timestamp);
    }

    /**
     * @notice Set the address of the Chainlink Operator contract
     * @param _oracle The address of the Chainlink Operator contract
     */
    function setOracle(address _oracle) public onlyOwner {
        if (_oracle == address(0)) revert InvalidInputZeroAddress();
        address oldOracle = chainlinkOracleAddress();
        setChainlinkOracle(_oracle);

        emit SetOracle(_oracle, oldOracle, block.timestamp);
    }

    /**
     * @notice Set the job id to be executed by Node Operator
     * @param jobId_ The job id to be executed by Node Operator
     */
    function setJobId(bytes32 jobId_) public onlyOwner {
        if (jobId_ == bytes32(0)) revert InvalidInputEmptyBytes32();
        bytes32 oldJobId = _jobId;
        _jobId = jobId_;

        emit SetJobId(_jobId, oldJobId, block.timestamp);
    }

    /**
     * @notice Set the amount of LINK token paid to Node Operator
     * @param fee_ The amount of LINK token paid to Node Operator
     */
    function setFee(uint256 fee_) public onlyOwner {
        if (fee_ == 0) revert NodeOperatorFeeCannotBeZero();
        if (fee_ < _MIN_NODE_OPERATOR_FEE) revert MinNodeOperatorFee();
        if (fee_ > _MAX_NODE_OPERATOR_FEE) revert MaxNodeOperatorFee();

        uint256 oldFee = _fee;
        _fee = fee_;

        emit SetFee(_fee, oldFee, block.timestamp);
    }
}
