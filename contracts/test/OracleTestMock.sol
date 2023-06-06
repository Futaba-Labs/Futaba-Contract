// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@chainlink/contracts/src/v0.8/ChainlinkClient.sol";
import "@chainlink/contracts/src/v0.8/ConfirmedOwner.sol";

import "../interfaces/IExternalAdapter.sol";
import "../interfaces/ILightClient.sol";
import "../interfaces/ILightClientMock.sol";
import "hardhat/console.sol";

/**
 * @title Oracle Mock contract
 * @notice Contracts used when testing Oracle Mock (skipping processing of modifiers when executing `fullfill()`)
 */
contract OracleTestMock is ChainlinkClient, ConfirmedOwner, IExternalAdapter {
    using Chainlink for Chainlink.Request;

    bytes32 private jobId;
    uint256 private fee;

    address public lightClient;

    constructor(
        address _tokenAddress,
        bytes32 _jobid,
        address _operator,
        uint256 _fee,
        address _lightClient
    ) ConfirmedOwner(msg.sender) {
        jobId = _jobid;
        setChainlinkToken(_tokenAddress);
        setChainlinkOracle(_operator);
        fee = _fee;
        lightClient = _lightClient;
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

        requestId = sendChainlinkRequest(req, fee);

        return requestId;
    }

    //@dev This function is called by Chainlink node operator(remove the "recordChainlinkFulfillment" modifier)
    function fulfill(bytes32 _requestId, bytes memory payload) public {
        QueryType.OracleResponse[] memory responses = abi.decode(
            payload,
            (QueryType.OracleResponse[])
        );
        require(lightClient != address(0x0), "Futaba: invalid ligth client");
        ILightClientMock(lightClient).updateHeader(responses);
    }

    function setClient(address _client) public onlyOwner {
        lightClient = _client;
    }

    function getClient() public view returns (address) {
        return lightClient;
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
            msg.sender == lightClient,
            "Futaba: only light client can call this function"
        );
        _;
    }
}
