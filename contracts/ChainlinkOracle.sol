// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import "@chainlink/contracts/src/v0.8/ChainlinkClient.sol";
import "@chainlink/contracts/src/v0.8/ConfirmedOwner.sol";

import "./interfaces/IExternalAdapter.sol";
import "./interfaces/IChainlinkLightClient.sol";

/**
 * @title Chainlink Oracle contract
 * @notice This is ChainlinkOracle contract when using Chainlink Node Operator
 */
contract ChainlinkOracle is ChainlinkClient, ConfirmedOwner, IExternalAdapter {
    /* ----------------------------- Libraries -------------------------------- */

    using Chainlink for Chainlink.Request;

    /* ----------------------------- Public Storage -------------------------------- */

    uint256 private constant MIN_NODE_OPERATOR_FEE = 0.001 ether;
    uint256 private constant MAX_NODE_OPERATOR_FEE = 1 ether;

    // Jobid to be executed by Node Operator
    bytes32 private jobId;
    // Amount of LINK token paid to Node Operator
    uint256 private fee;
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
        setChainlinkToken(_tokenAddress);
        setChainlinkOracle(_operator);
        setFee(_fee);
        setClient(_lightClient);
    }

    /* ----------------------------- External Functions -------------------------------- */

    /**
     * @notice Send request to Chainlink Node
     * @param queries Query data formatted for Chainlink
     * @return requestId Request id issued by chainlink
     */
    function notifyOracle(
        QueryType.OracleQuery[] memory queries
    ) external onlyLightClient returns (bytes32 requestId) {
        Chainlink.Request memory req = buildChainlinkRequest(
            jobId,
            address(this),
            this.fulfill.selector
        );
        bytes memory encodedQueries = abi.encode(queries);
        Chainlink.addBytes(req, "queries", encodedQueries);

        requestId = sendChainlinkRequest(req, fee);

        return requestId;
    }

    /* ----------------------------- Public Functions -------------------------------- */

    /**
     * @notice Callback function executed by the Node Operator to return data
     * @param _requestId Id of the request
     * @param payload Data returned by the Node Operator
     */
    function fulfill(
        bytes32 _requestId,
        bytes memory payload
    ) public virtual recordChainlinkFulfillment(_requestId) {
        QueryType.OracleResponse[] memory responses = abi.decode(
            payload,
            (QueryType.OracleResponse[])
        );
        if (lightClient == address(0)) revert InvalidLightClient();
        IChainlinkLightClient(lightClient).updateHeader(responses);
    }

    /** set and get configuration */
    function setClient(address _client) public onlyOwner {
        if (_client == address(0)) revert InvalidInputZeroAddress();
        address oldLightClient = lightClient;
        lightClient = _client;
        emit SetClient(_client, oldLightClient, block.timestamp);
    }

    function getClient() public view returns (address) {
        return lightClient;
    }

    function setLinkToken(address _tokenAddress) public onlyOwner {
        if (_tokenAddress == address(0)) revert InvalidInputZeroAddress();
        address oldTokenAddress = chainlinkTokenAddress();
        setChainlinkToken(_tokenAddress);

        emit SetLinkToken(_tokenAddress, oldTokenAddress, block.timestamp);
    }

    function getLinkToken() public view returns (address) {
        return chainlinkTokenAddress();
    }

    function setOracle(address _oracle) public onlyOwner {
        if (_oracle == address(0)) revert InvalidInputZeroAddress();
        address oldOracle = chainlinkOracleAddress();
        setChainlinkOracle(_oracle);

        emit SetOracle(_oracle, oldOracle, block.timestamp);
    }

    function getOracle() public view returns (address) {
        return chainlinkOracleAddress();
    }

    function setJobId(bytes32 _jobId) public onlyOwner {
        if (_jobId == bytes32(0)) revert InvalidInputEmptyBytes32();
        bytes32 oldJobId = jobId;
        jobId = _jobId;

        emit SetJobId(_jobId, oldJobId, block.timestamp);
    }

    function getJobId() public view returns (bytes32) {
        return jobId;
    }

    function setFee(uint256 _fee) public onlyOwner {
        if (_fee == 0) revert NodeOperatorFeeCannotBeZero();
        if (_fee < MIN_NODE_OPERATOR_FEE) revert MinNodeOperatorFee();
        if (_fee > MAX_NODE_OPERATOR_FEE) revert MaxNodeOperatorFee();

        uint256 oldFee = fee;
        fee = _fee;

        emit SetFee(_fee, oldFee, block.timestamp);
    }

    function getFee() public view returns (uint256) {
        return fee;
    }

    /* ----------------------------- Modifiers -------------------------------- */

    /**
     * @notice Modifier to check if the caller is the light client
     */
    modifier onlyLightClient() {
        if (msg.sender != lightClient) revert NotAuthorized();
        _;
    }
}
