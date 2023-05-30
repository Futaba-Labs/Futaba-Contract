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
 * @notice This is Oracle's mock contract when using Chainlink Node Operator
 * @notice Not currently in use
 */
contract OracleTestMock is ChainlinkClient, ConfirmedOwner, IExternalAdapter {
    using Chainlink for Chainlink.Request;

    bytes32 private jobId;
    uint256 private fee;

    address public ligthClient;

    constructor(
        address _tokenAddress,
        bytes32 _jobid,
        address _operator,
        uint256 _fee
    ) ConfirmedOwner(msg.sender) {
        jobId = _jobid;
        setChainlinkToken(_tokenAddress);
        setChainlinkOracle(_operator);
        fee = _fee;
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
