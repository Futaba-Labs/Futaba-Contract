// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@chainlink/contracts/src/v0.8/ChainlinkClient.sol";
import "@chainlink/contracts/src/v0.8/ConfirmedOwner.sol";

import "../interfaces/IOracle.sol";
import "../interfaces/ILightClient.sol";
import "../interfaces/ILightClientMock.sol";

/**
 * @title Oracle Mock contract
 * @notice This is Oracle's mock contract when using Chainlink Node Operator
 * @notice Not currently in use
 */
contract OracleMock is ChainlinkClient, ConfirmedOwner {
    using Chainlink for Chainlink.Request;

    bytes32 private jobId;
    uint256 private fee;

    address public ligthClient;

    constructor(address _tokenAddress) ConfirmedOwner(msg.sender) {
        jobId = "af037e503e964dd2a1d3cb0c715f945b";
        setChainlinkToken(_tokenAddress);
    }

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

        return sendChainlinkRequest(req, fee);
    }

    function fulfill(
        bytes32 _requestId,
        bytes memory payload
    ) public recordChainlinkFulfillment(_requestId) {
        QueryType.OracleResponse[] memory responses = abi.decode(
            payload,
            (QueryType.OracleResponse[])
        );
        require(ligthClient != address(0x0), "Futaba: invalid ligth client");
        ILightClientMock(ligthClient).updateHeader(responses);
    }

    function setClient(address _client) public onlyOwner {
        ligthClient = _client;
    }

    function getClient() public view returns (address) {
        return ligthClient;
    }

    function setLinkToken(address _tokenAddress) public onlyOwner {
        setChainlinkToken(_tokenAddress);
    }

    function getLinkToken() public view returns (address) {
        return chainlinkTokenAddress();
    }

    function setOracle(address _oracle) public onlyOwner {
        setChainlinkOracle(_oracle);
    }

    function getOracle() public view returns (address) {
        return chainlinkOracleAddress();
    }

    function setJobId(bytes32 _jobId) public onlyOwner {
        jobId = _jobId;
    }

    function getJobId() public view returns (bytes32) {
        return jobId;
    }

    function setFee(uint256 _fee) public onlyOwner {
        fee = _fee;
    }

    function getFee() public view returns (uint256) {
        return fee;
    }

    modifier onlyLightClient() {
        require(
            msg.sender == ligthClient,
            "Futaba: only light client can call this function"
        );
        _;
    }
}
