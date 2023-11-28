// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import "../interfaces/ILightClient.sol";
import "../interfaces/IChainlinkLightClient.sol";
import "../interfaces/IOracle.sol";
import "../lib/TrieProofs.sol";
import "../lib/EthereumDecoder.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

import "../QueryType.sol";

contract FunctionsLightClientMock is
    ILightClient,
    IChainlinkLightClient,
    Ownable
{
    enum Location {
        Inline,
        Remote
    }

    using TrieProofs for bytes;

    struct Proof {
        uint256 dstChainId;
        uint256 height;
        bytes proof;
    }
    struct AccountProof {
        bytes32 root;
        address account;
        bytes proof;
    }
    struct StorageProof {
        bytes32 root;
        bytes32 path;
        bytes proof;
    }
    struct Config {
        uint64 baseGas;
        uint64 gasPerSlot;
    }

    mapping(uint256 => mapping(uint256 => mapping(address => bytes32)))
        public approvedStorageRoots;

    mapping(uint256 => mapping(uint256 => bytes32)) public approvedStateRoots;
    mapping(uint256 => string) public providerURLs;

    address public oracle;

    string public source;

    uint64 public subscriptionId;

    Config public config;

    event SetOracle(address oracle);

    event SetSource(string source);

    event SetSubscriptionId(uint64 subscriptionId);

    event SetProviderURL(uint32 chainId, string url);

    event SetConfig(uint64 baseGas, uint64 gasPerSlot);

    event UpdateStateRoot(
        uint256 indexed chainId,
        uint256 indexed height,
        bytes32 root
    );

    function requestQuery(QueryType.QueryRequest[] memory queries) external {
        string memory args = "[";
        for (uint i = 0; i < queries.length; i++) {
            QueryType.QueryRequest memory q = queries[i];
            args = string(
                abi.encodePacked(
                    args,
                    '["',
                    providerURLs[q.dstChainId],
                    '","',
                    Strings.toString(q.dstChainId),
                    '","',
                    Strings.toString(q.height),
                    '"]'
                )
            );
            if (i != queries.length - 1) {
                args = string(abi.encodePacked(args, ","));
            }
        }
        args = string(abi.encodePacked(args, "]"));

        string[] memory params = new string[](1);
        params[0] = args;

        IOracle(oracle).executeRequest(
            source,
            bytes(""),
            IOracle.Location.Inline,
            params,
            subscriptionId,
            300000
        );
    }

    function verify(
        bytes memory message
    ) public returns (bool, bytes[] memory) {
        Proof[] memory proofs = abi.decode(message, (Proof[]));
        bytes[] memory results = new bytes[](proofs.length);
        for (uint i = 0; i < proofs.length; i++) {
            Proof memory proof = proofs[i];
            (
                AccountProof memory accountProof,
                StorageProof[] memory storageProofs
            ) = abi.decode(proofs[i].proof, (AccountProof, StorageProof[]));
            if (
                approvedStorageRoots[proof.dstChainId][proof.height][
                    accountProof.account
                ] != bytes32("")
            ) {
                bytes memory result;
                for (uint j = 0; j < storageProofs.length; j++) {
                    StorageProof memory storageProof = storageProofs[j];
                    require(
                        approvedStorageRoots[proof.dstChainId][proof.height][
                            accountProof.account
                        ] == storageProof.root,
                        "Futaba: verify - different trie roots"
                    );
                    bytes32 path = keccak256(
                        abi.encodePacked(storageProof.path)
                    );
                    bytes memory value = storageProof.proof.verify(
                        storageProof.root,
                        path
                    );
                    result = bytes.concat(result, value);
                }
                results[i] = result;
            } else {
                EthereumDecoder.Account memory account = EthereumDecoder
                    .toAccount(
                        accountProof.proof.verify(
                            approvedStateRoots[proof.dstChainId][proof.height],
                            keccak256(abi.encodePacked(accountProof.account))
                        )
                    );
                approvedStorageRoots[proof.dstChainId][proof.height][
                    accountProof.account
                ] = account.storageRoot;
                for (uint j = 0; j < storageProofs.length; j++) {
                    StorageProof memory storageProof = storageProofs[j];
                    bytes32 path = keccak256(
                        abi.encodePacked(storageProof.path)
                    );
                    results[i] = storageProof.proof.verify(
                        storageProof.root,
                        path
                    );
                }
            }
        }
        return (true, results);
    }

    function updateHeader(
        QueryType.OracleResponse[] memory responses
    ) external override onlyOracle {
        for (uint i = 0; i < responses.length; i++) {
            QueryType.OracleResponse memory response = responses[i];
            bytes32 root = approvedStateRoots[response.dstChainId][
                response.height
            ];
            if (root != bytes32("")) {
                require(
                    root == response.root,
                    "Futaba: updateHeader - different trie roots"
                );
            } else {
                approvedStateRoots[response.dstChainId][
                    response.height
                ] = response.root;
            }
            emit UpdateStateRoot(
                response.dstChainId,
                response.height,
                response.root
            );
        }
    }

    function estimateFee(
        QueryType.QueryRequest[] memory queries
    ) external view returns (uint256) {
        return 0;
    }

    function setOracle(address _oracle) public {
        oracle = _oracle;
        emit SetOracle(_oracle);
    }

    function getOracle() public view returns (address) {
        return oracle;
    }

    function setProviderURL(
        uint32 chainId,
        string memory url
    ) public onlyOwner {
        providerURLs[chainId] = url;
        emit SetProviderURL(chainId, url);
    }

    function getProviderURL(
        uint32 chainId
    ) public view returns (string memory) {
        return providerURLs[chainId];
    }

    function setSource(string memory _source) public onlyOwner {
        source = _source;
        emit SetSource(_source);
    }

    function getSource() public view returns (string memory) {
        return source;
    }

    function setSubscriptionId(uint64 _subscriptionId) public onlyOwner {
        subscriptionId = _subscriptionId;
        emit SetSubscriptionId(_subscriptionId);
    }

    function getSubscriptionId() public view returns (uint64) {
        return subscriptionId;
    }

    function setConfig(Config memory _config) public onlyOwner {
        config = _config;
        emit SetConfig(_config.baseGas, _config.gasPerSlot);
    }

    function getConfig() public view returns (Config memory) {
        return config;
    }

    function supportsInterface(
        bytes4 interfaceId
    ) external pure returns (bool) {
        return interfaceId == type(ILightClient).interfaceId;
    }

    modifier onlyOracle() {
        require(msg.sender == oracle, "Futaba: onlyOracle - not oracle");
        _;
    }
}
